require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('setalert')
    .setDescription('Set a price or metric alert.')
    // Price Subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('price')
        .setDescription('Set an alert for a specific trading pair price.')
        // --- REQUIRED OPTIONS MUST COME FIRST ---
        .addStringOption(option => option.setName('exchange').setDescription('The exchange to track.').setRequired(true)
          .addChoices(
              { name: 'Binance', value: 'binance' },
              { name: 'Bybit', value: 'bybit' },
              { name: 'OKX', value: 'okx' },
              { name: 'KuCoin', value: 'kucoin' },
              { name: 'MEXC', value: 'mexc' },
              { name: 'Bitget', value: 'bitget' }
          ))
        .addStringOption(option => option.setName('coin').setDescription('The coin symbol ONLY (BTC ✅ BTC/USDT ❌).').setRequired(true))
        .addStringOption(option => option.setName('condition').setDescription('The trigger condition.').setRequired(true)
          .addChoices({ name: 'Price rises to or above', value: 'ABOVE' }, { name: 'Price drops to or below', value: 'BELOW' }))
        .addNumberOption(option => option.setName('price').setDescription('The target price in USD.').setRequired(true))
        // --- OPTIONAL OPTIONS MUST COME LAST ---
        .addStringOption(option => option.setName('quote').setDescription('The currency to quote against (e.g., USDT). Leave blank for any stablecoin.').setRequired(false))
        .addRoleOption(option => option.setName('role').setDescription('Optional role to mention.').setRequired(false)))
    // Metric Subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('metric')
        .setDescription('Set an alert for a market-wide metric.')
        .addStringOption(option => option.setName('metric').setDescription('The market metric to track.').setRequired(true)
          .addChoices({ name: 'Bitcoin Dominance (%)', value: 'BTC_DOMINANCE' }))
        .addStringOption(option => option.setName('condition').setDescription('The trigger condition.').setRequired(true)
          .addChoices({ name: 'Rises to or above', value: 'ABOVE' }, { name: 'Drops to or below', value: 'BELOW' }))
        .addNumberOption(option => option.setName('target').setDescription('The target value (e.g., 55.5 for 55.5%).').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Optional role to mention.').setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('dex')
        .setDescription('Set an alert for a pair on a Decentralized Exchange.')
        .addStringOption(option => option.setName('pair').setDescription('The DEX pair to track.').setRequired(true)
          .addChoices({ name: 'WETH / USDC (Uniswap V3)', value: 'WETH/USDC' }))
        .addStringOption(option => option.setName('condition').setDescription('The trigger condition.').setRequired(true)
          .addChoices({ name: 'Price rises to or above', value: 'ABOVE' }, { name: 'Price drops to or below', value: 'BELOW' }))
        .addNumberOption(option => option.setName('price').setDescription('The target price in USDC.').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Optional role to mention.').setRequired(false))
    ),
  
  // List Alerts Command
  new SlashCommandBuilder()
    .setName('listalerts')
    .setDescription('Shows a list of all your active alerts.'),
    
  // Delete Alert Command
  new SlashCommandBuilder()
    .setName('deletealert')
    .setDescription('Deletes one of your active alerts.')
    .addIntegerOption(option => 
      option.setName('id')
        .setDescription('The ID of the alert you want to delete.')
        .setRequired(true)),

  // Price Command
  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Gets the latest price for a coin or trading pair.')
    .addStringOption(option => option.setName('coin').setDescription('The coin symbol ONLY (e.g., BTC, ETH).').setRequired(true))
    .addStringOption(option => option.setName('quote').setDescription('Optional: The currency to quote against (e.g., USDT).').setRequired(false)),

  // Chart Command
  new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Generates a price chart for a trading pair.')
    .addStringOption(option => option.setName('exchange').setDescription('The exchange (e.g., Binance, KuCoin).').setRequired(true))
    .addStringOption(option => option.setName('coin').setDescription('The coin symbol (e.g., BTC, ETH).').setRequired(true))
    .addStringOption(option => option.setName('quote').setDescription('The quote currency (e.g., USDT).').setRequired(true)),
    
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands for guild ${guildId}.`);
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );
    console.log(`✅ Successfully reloaded ${data.length} commands for the test guild.`);
  } catch (error) {
    console.error(error);
  }
})();