// This is a one-time use script to clear all GLOBAL commands.
// Run with `node clear-global-commands.js`

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

const rest = new REST({ version: '10' }).setToken(token);

console.log('Attempting to delete all global application (/) commands.');

// This pushes an empty array to the commands endpoint, effectively clearing them.
rest.put(Routes.applicationCommands(clientId), { body: [] })
    .then(() => console.log('✅ Successfully deleted all global commands.'))
    .catch(console.error);