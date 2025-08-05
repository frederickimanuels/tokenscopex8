const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client, Events, GatewayIntentBits } = require('discord.js');
const db = require('./db'); // --- NEW: Import our database module

const token = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}. TokenScopeX8 is online!`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setalert') {
    // Defer the reply to give us more than 3 seconds to process, especially with database calls
    await interaction.deferReply();

    const exchange = interaction.options.getString('exchange');
    const pair = interaction.options.getString('pair').toUpperCase();
    const price = interaction.options.getNumber('price');
    const role = interaction.options.getRole('role');

    // --- NEW DATABASE LOGIC ---
    try {
      // For now, we only alert when the price is BELOW the target. We'll make this smarter later.
      const triggerCondition = 'BELOW';

      const queryText = `
        INSERT INTO alerts(user_id, channel_id, exchange, pair, target_price, trigger_condition, mention_role_id)
        VALUES($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      // Parameterized queries ($1, $2, etc.) are a critical security measure against SQL Injection.
      const queryParams = [
        interaction.user.id,
        interaction.channel.id,
        exchange,
        pair,
        price,
        triggerCondition,
        role ? role.id : null // Store the role ID, or NULL if no role was provided
      ];

      const result = await db.query(queryText, queryParams);
      console.log('Alert saved to database:', result.rows[0]);

      let replyMessage = `🔔 **Alert Set!**\nI will notify you when \`${pair}\` on **${exchange}** goes below **$${price}**.`;
      if (role) {
        replyMessage += `\nI will also mention the ${role} role.`;
      }

      // Edit the deferred reply with our final message.
      await interaction.editReply(replyMessage);

    } catch (error) {
      console.error('Error saving alert to database:', error);
      await interaction.editReply('Sorry, there was an error and I could not save your alert. Please try again later.');
    }
    // --- END OF NEW DATABASE LOGIC ---
  }
});

client.login(token);