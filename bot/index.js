require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { createClient } = require('redis');
const db = require('./db');

const token = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}. Bot service is online!`);
});

const redisClient = createClient({ url: process.env.UPSTASH_REDIS_TCP_URL });
redisClient.on('error', err => console.error('Bot Redis Client Error', err));
redisClient.connect();

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // --- HANDLER FOR /setalert ---
   // --- HANDLER FOR /setalert ---
  if (interaction.commandName === 'setalert') {
    await interaction.deferReply({ ephemeral: true });

    try {
      if (interaction.options.getSubcommand() === 'price') {
        const exchange = interaction.options.getString('exchange');
        const coin = interaction.options.getString('coin').toUpperCase();
        const quote = interaction.options.getString('quote')?.toUpperCase(); 
        const price = interaction.options.getNumber('price');
        const role = interaction.options.getRole('role');
        const triggerCondition = interaction.options.getString('condition');
        const conditionText = triggerCondition === 'ABOVE' ? 'rises to or above' : 'drops to or below';

        const baseCurrency = coin;
        const quoteCurrency = quote ? quote : 'USD_STABLES';
        const replyText = quote ? `\`${baseCurrency}/${quoteCurrency}\`` : `\`${baseCurrency}\` against any major stablecoin`;

        const queryText = `
          INSERT INTO alerts(user_id, channel_id, alert_type, exchange, base_currency, quote_currency, target_price, trigger_condition, mention_role_id)
          VALUES($1, $2, 'PRICE', $3, $4, $5, $6, $7, $8) RETURNING *;`;
        const queryParams = [interaction.user.id, interaction.channel.id, exchange, baseCurrency, quoteCurrency, price, triggerCondition, role ? role.id : null];
        
        await db.query(queryText, queryParams);

        await interaction.editReply(`🔔 **Price Alert Set!**\nI will notify you when ${replyText} on **${exchange}** ${conditionText} **$${price}**.`);

      } else if (interaction.options.getSubcommand() === 'metric') {
        const metricName = interaction.options.getString('metric');
        const target = interaction.options.getNumber('target');
        const role = interaction.options.getRole('role');
        const triggerCondition = interaction.options.getString('condition');
        const metricText = metricName === 'BTC_DOMINANCE' ? 'Bitcoin Dominance' : 'Metric';
        const conditionText = triggerCondition === 'ABOVE' ? 'rises to or above' : 'drops to or below';
        
        const queryText = `
          INSERT INTO alerts(user_id, channel_id, alert_type, metric_name, target_price, trigger_condition, mention_role_id)
          VALUES($1, $2, 'METRIC', $3, $4, $5, $6) RETURNING *;`;
        const queryParams = [interaction.user.id, interaction.channel.id, metricName, target, triggerCondition, role ? role.id : null];
        
        await db.query(queryText, queryParams);

        await interaction.editReply(`📈 **Metric Alert Set!**\nI will notify you when **${metricText}** ${conditionText} **${target}%**.`);
      }
    } catch (error) {
      console.error('Error processing /setalert command:', error);
      await interaction.editReply('Sorry, there was an error saving your alert.');
    }
  }

  // --- HANDLER FOR /listalerts ---
  else if (interaction.commandName === 'listalerts') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await db.query(
        `SELECT * FROM alerts WHERE user_id = $1 AND status = 'active' ORDER BY id ASC`,
        [interaction.user.id]
      );

      if (result.rows.length === 0) {
        await interaction.editReply("You have no active alerts.");
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Active Alerts')
        .setDescription('Use `/deletealert` to remove one.');

      for (const alert of result.rows) {
        let description = '';
        if (alert.alert_type === 'PRICE') {
          const conditionText = alert.trigger_condition === 'ABOVE' ? '>=' : '<=';
          const pairName = alert.quote_currency === 'USD_STABLES' ? alert.base_currency : `${alert.base_currency}/${alert.quote_currency}`;
          description = `**Type:** Price\n**Exchange:** ${alert.exchange}\n**Pair:** ${pairName}\n**Condition:** ${conditionText} $${alert.target_price}`;
        } else if (alert.alert_type === 'METRIC') {
          const conditionText = alert.trigger_condition === 'ABOVE' ? '>=' : '<=';
          const metricText = alert.metric_name === 'BTC_DOMINANCE' ? 'BTC Dominance' : 'Metric';
          description = `**Type:** Metric\n**Metric:** ${metricText}\n**Condition:** ${conditionText} ${alert.target_price}%`;
        }
        embed.addFields({ name: `Alert ID: ${alert.id}`, value: description, inline: true });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error fetching alerts:', error);
      await interaction.editReply('Sorry, there was an error fetching your alerts.');
    }
  }

  // --- HANDLER FOR /deletealert ---
  else if (interaction.commandName === 'deletealert') {
    await interaction.deferReply({ ephemeral: true });

    const alertId = interaction.options.getInteger('id');
    const userId = interaction.user.id;

    try {
      const result = await db.query(
        `UPDATE alerts SET status = 'cancelled' WHERE id = $1 AND user_id = $2 RETURNING *;`,
        [alertId, userId]
      );

      if (result.rowCount === 0) {
        await interaction.editReply(`⚠️ Alert with ID \`${alertId}\` not found, or you don't have permission to delete it.`);
      } else {
        await interaction.editReply(`✅ Successfully cancelled Alert ID: \`${alertId}\`.`);
      }
    } catch (error){
      console.error('Error deleting alert:', error);
      await interaction.editReply('Sorry, there was an error cancelling your alert.');
    }
  }

  else if (interaction.commandName === 'price') {
    await interaction.deferReply();
    
    const coin = interaction.options.getString('coin').toUpperCase();
    const quote = interaction.options.getString('quote')?.toUpperCase() || 'USDT'; // Default to USDT if quote is blank

    const redisKey = `price:${coin}${quote}`;
    const price = await redisClient.get(redisKey);

    if (price) {
      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`Price for ${coin}/${quote}`)
        .setDescription(`**$${parseFloat(price).toLocaleString()}**`)
        .setTimestamp()
        .setFooter({ text: 'Price is cached and may be slightly delayed.' });
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply(`Sorry, the price for \`${coin}/${quote}\` is not available right now. An alert must be active for its price to be tracked.`);
    }
  }
});
  


client.login(token);