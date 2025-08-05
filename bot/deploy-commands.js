const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // --- NEW: Get the Guild ID from .env

// We haven't changed the command definition itself
const commands = [
  new SlashCommandBuilder()
    .setName('setalert')
    .setDescription('Set a price alert for a crypto pair.')
    .addStringOption(option =>
      option.setName('exchange')
        .setDescription('The CEX or DEX (e.g., Binance, KuCoin)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('pair')
        .setDescription('The trading pair (e.g., btc/usdt)')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('price')
        .setDescription('The target price to be alerted at')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Optional role to mention in the alert (e.g., @everyone)')
        .setRequired(false)),
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands for guild ${guildId}.`);

    // --- CHANGED LINE ---
    // We now use `applicationGuildCommands` which targets a specific server for instant updates.
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId), // This is the line that changed
      { body: commands },
    );

    console.log(`✅ Successfully reloaded ${data.length} commands for the test guild.`);
  } catch (error) {
    console.error(error);
  }
})();