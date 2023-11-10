//require('dotenv').config();
const TOKEN = 'TOKEN GOES HERE';
const GUILD_ID = 'GUILD_ID GOES HERE';
const CLIENT_ID = 'CLIENT ID GOES HERE';

const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
    {
        name: 'stop',
        description: 'Gets info on soonest bus coming to a Translink Bus Stop #',
        options: [
            {
                name: 'stop-number',
                description: 'The Bus Stop # of the stop you want info for',
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ],
    },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Registering slash commands...');

        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            { body: commands }
        );

        console.log('Slash commands were registered successfully!');
    } catch (error) {
        console.log(`There was an error: ${error}`);
    }
})();
