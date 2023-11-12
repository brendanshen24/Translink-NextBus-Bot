//require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { Client, IntentsBitField } = require('discord.js');
//const {parse} = require("dotenv");

const wait = require('node:timers/promises').setTimeout;

const TOKEN = 'TOKEN_HERE';
const GUILD_ID = 'GUILD_ID_HERE';
const CLIENT_ID = 'CLIENT_ID_HERE';

const fix_delay = (delay_str) => {
    // Extract the numerical part of the input string
    const delay_num = parseFloat(delay_str);

    if (delay_str == '') {
        return 'Delayed by: **0 min**';
    } else if (delay_num < 0) {
        return 'Delayed by: **' + Math.abs(delay_num) + ' min**';
    } else if (delay_num === 0) {
        return 'Delayed by: **0 min**';
    } else {
        return 'Early by: **' + delay_num + ' min**';
    }
}

const convert_time = (time) => {
    const split_time = time.split(':');
    if (parseInt(split_time[0]) > 24){
        split_time[0] = (parseInt(split_time[0]) - 24).toString();
    }
    //console.log(split_time)
    if (parseInt(split_time[0]) > 12){
        const new_time = parseInt(split_time[0])-12;
        const new_string = new_time.toString()+':'+split_time[1]+' PM'
        return new_string;
    }
    else{
        return split_time.join(':') + ' AM';
    }
}

const has_AC = (model) => {
    const buses = {
        "Alexander Dennis Enviro500": true,
        "Chevrolet 4500/Girardin G5": false,
        "Chevrolet 4500/ARBOC SOF 27": true,
        "Chevrolet 4500/ARBOC SOM 28": true,
        "New Flyer D40LF": false,
        "New Flyer D40LFR": false,
        "New Flyer D60LFR": false,
        "New Flyer DE60LFR": false,
        "New Flyer E40LFR": false,
        "New Flyer E60LFR": false,
        "New Flyer XD40": true,
        "New Flyer XDE60": true,
        "New Flyer XN40": true,
        "Nova Bus LFS": false,
        "Nova Bus LFS HEV": false,
        "Nova Bus LFS Suburban": true,
    };

    const split_model = model.split(' ');
    if (parseInt(split_model[0]) >= 2012){
        return 'Yes!'
    }
    else{
        split_model.shift();
        const new_string = split_model.join(' ');

        if(buses[new_string] == true){
            return 'Yes!'
        }
        else{
            return 'No!'
        }
    }
}

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ],
});

client.on('ready',(c) => {
    console.log(`${c.user.tag} is online.`)
})

client.on('messageCreate',(message) => {
    //console.log(message.content);
    if(message.author.bot){
        return;
    }

    if(message.content[0] == '!'){
        if(message.content.split(' ')[0] == '!stop'){
            const stopID = message.content.split(' ')[1]

            //const stopID = 52258;
            const baseUrl = 'https://compat.sorrybusfull.com'; // Base URL
            const homepagePath = ('/stoprt/'+stopID.toString()); // Homepage path

            const getDataFromMainPage = async () => {
                try {
                    const response = await axios.get(`${baseUrl}${homepagePath}`);
                    if (response.status === 200) {
                        const mainPageHtml = response.data;
                        const mainPage$ = cheerio.load(mainPageHtml);

                        // Extract title
                        const title = mainPage$('head title').text().trim();

                        // Extract realtime status
                        const realtime = mainPage$('#realtime').text().trim();

                        // Extract schedule data
                        const scheduleData = [];
                        const vehicleRequests = [];

                        mainPage$('div.block #stop table tr').each((index, element) => {
                            const columns = mainPage$(element).find('td');
                            const rowData = {};

                            columns.each((i, col) => {
                                const columnName = ['Trip', 'Sched', 'Corr', 'Delay', 'Wait', 'Block', 'Vehicle'][i];
                                rowData[columnName.toLowerCase()] = mainPage$(col).text().trim();
                            });

                            // Add vehicle number
                            const vehicleLink = mainPage$(element).find('td a[href^="/vehicle/"]');
                            if (vehicleLink.length > 0) {
                                const vehiclePageUrl = `${baseUrl}${vehicleLink.attr('href')}`;
                                const vehicleRequest = axios.get(vehiclePageUrl).then(vehiclePageResponse => {
                                    const vehiclePageHtml = vehiclePageResponse.data;
                                    const vehiclePage$ = cheerio.load(vehiclePageHtml);
                                    const model = vehiclePage$('th:contains("Model")').next('td').text().trim();
                                    rowData['model'] = model;
                                });

                                vehicleRequests.push(vehicleRequest);
                            }

                            // Push the row data to the main data array
                            scheduleData.push(rowData);
                        });

                        // Wait for all vehicle information requests to complete
                        await Promise.all(vehicleRequests);

                        // Organize data into an object
                        const mainPageData = {
                            title,
                            realtime,
                            scheduleData,
                        };

                        let buses_at_this_stop = []
                        let to_list = []
                        for (let i = 1; i < mainPageData.scheduleData.length; i++) {
                            if(buses_at_this_stop.includes(mainPageData.scheduleData[i].trip) == false){
                                buses_at_this_stop.push(mainPageData.scheduleData[i].trip)
                                to_list.push(mainPageData.scheduleData[i])
                            }
                        }
                        //console.log(to_list)
                        let formatted_message;
                        if(to_list.length == 1){
                            const scheduled_for = convert_time(to_list[0].sched);
                            const delay = fix_delay(to_list[0].delay);
                            let adjust_time = to_list[0].corr
                            if (adjust_time ==''){
                                adjust_time = scheduled_for;
                            }
                            else{
                                adjust_time = convert_time(adjust_time)
                            }

                            let wait_time = to_list[0].wait;
                            if (wait_time == ''){
                                wait_time = '> 90 min'
                            }
                            const vehicle = to_list[0].model;
                            //formatted_message = `The next departing bus for [${mainPageData.title}](https://tcomm.bustrainferry.com/mobile/stop/${stopID}) is for:\n# ${to_list[0].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\nDelay: **${delay}**\nArrival time including Delay: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**\nDoes this bus have AC? **${has_AC(mainPageData.scheduleData[1].model)}**`;
                            formatted_message = `The next departing bus for [${mainPageData.title}](https://tcomm.bustrainferry.com/mobile/stop/${stopID}) is for:\n# ${to_list[0].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\n${delay}\nAdjusted arrival time: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**`;

                        }
                        else{
                            formatted_message = `The next departing buses for [${mainPageData.title}](https://tcomm.bustrainferry.com/mobile/stop/${stopID}) are for:`;
                            for (let i = 0; i < to_list.length; i++) {
                                const scheduled_for = convert_time(to_list[i].sched);
                                const delay = fix_delay(to_list[i].delay);
                                let adjust_time = to_list[i].corr
                                if (adjust_time ==''){
                                    adjust_time = scheduled_for;
                                }
                                else{
                                    adjust_time = convert_time(adjust_time)
                                }
                                let wait_time = to_list[i].wait;
                                if (wait_time == ''){
                                    wait_time = '> 90 min'
                                }
                                const vehicle = to_list[i].model;
                                //formatted_message += `\n\n# ${to_list[i].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\nDelay: **${delay}\nArrival time including delay: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**\nDoes this bus have AC? **${has_AC(to_list[i].model)}**`;
                                formatted_message += `\n\n# ${to_list[i].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\n${delay}\nAdjusted arrival time: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**`;
                                //console.log(formatted_message)
                            }
                        }
                        await message.reply(formatted_message);
                    }
                } catch (error) {
                    console.error('Error fetching the main page:', error);
                    await message.reply('That stop does not exist!');
                }
            };
            getDataFromMainPage();
        }
    }
})

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'stop') {
        let stopID = interaction.options.get('stop-number').value.trim();
        await interaction.deferReply();
        await wait(5000);
        //const stopID = 52258;
        const baseUrl = 'https://compat.sorrybusfull.com'; // Base URL
        const homepagePath = ('/stoprt/'+stopID.toString()); // Homepage path

        const getDataFromMainPage = async () => {
            try {
                const response = await axios.get(`${baseUrl}${homepagePath}`);
                if (response.status === 200) {
                    const mainPageHtml = response.data;
                    const mainPage$ = cheerio.load(mainPageHtml);

                    // Extract title
                    const title = mainPage$('head title').text().trim();

                    // Extract realtime status
                    const realtime = mainPage$('#realtime').text().trim();

                    // Extract schedule data
                    const scheduleData = [];
                    const vehicleRequests = [];

                    mainPage$('div.block #stop table tr').each((index, element) => {
                        const columns = mainPage$(element).find('td');
                        const rowData = {};

                        columns.each((i, col) => {
                            const columnName = ['Trip', 'Sched', 'Corr', 'Delay', 'Wait', 'Block', 'Vehicle'][i];
                            rowData[columnName.toLowerCase()] = mainPage$(col).text().trim();
                        });

                        // Add vehicle number
                        const vehicleLink = mainPage$(element).find('td a[href^="/vehicle/"]');
                        if (vehicleLink.length > 0) {
                            const vehiclePageUrl = `${baseUrl}${vehicleLink.attr('href')}`;
                            const vehicleRequest = axios.get(vehiclePageUrl).then(vehiclePageResponse => {
                                const vehiclePageHtml = vehiclePageResponse.data;
                                const vehiclePage$ = cheerio.load(vehiclePageHtml);
                                const model = vehiclePage$('th:contains("Model")').next('td').text().trim();
                                rowData['model'] = model;
                            });

                            vehicleRequests.push(vehicleRequest);
                        }

                        // Push the row data to the main data array
                        scheduleData.push(rowData);
                    });

                    // Wait for all vehicle information requests to complete
                    await Promise.all(vehicleRequests);

                    // Organize data into an object
                    const mainPageData = {
                        title,
                        realtime,
                        scheduleData,
                    };

                    // Print or process the extracted data
                    //console.log('Main Page Data:', mainPageData);
                    //console.log(mainPageData.scheduleData[1]);
                    let buses_at_this_stop = []
                    let to_list = []
                    for (let i = 1; i < mainPageData.scheduleData.length; i++) {
                        if(buses_at_this_stop.includes(mainPageData.scheduleData[i].trip) == false){
                            buses_at_this_stop.push(mainPageData.scheduleData[i].trip)
                            to_list.push(mainPageData.scheduleData[i])
                        }
                    }
                    //console.log(to_list)
                    let formatted_message;
                    if(to_list.length == 1){
                        const scheduled_for = convert_time(to_list[0].sched);
                        const delay = fix_delay(to_list[0].delay);
                        let adjust_time = to_list[0].corr
                        if (adjust_time ==''){
                            adjust_time = scheduled_for;
                        }
                        else{
                            adjust_time = convert_time(adjust_time)
                        }

                        let wait_time = to_list[0].wait;
                        if (wait_time == ''){
                            wait_time = '> 90 min'
                        }
                        const vehicle = to_list[0].model;
                        //formatted_message = `The next departing bus for [${mainPageData.title}](https://tcomm.bustrainferry.com/mobile/stop/${stopID}) is for:\n# ${to_list[0].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\nDelay: **${delay}**\nArrival time including Delay: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**\nDoes this bus have AC? **${has_AC(mainPageData.scheduleData[1].model)}**`;
                        formatted_message = `The next departing bus for [${mainPageData.title}](https://tcomm.bustrainferry.com/mobile/stop/${stopID}) is for:\n# ${to_list[0].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\n${delay}\nAdjusted arrival time: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**`;

                    }
                    else{
                        formatted_message = `The next departing buses for [${mainPageData.title}](https://tcomm.bustrainferry.com/mobile/stop/${stopID}) are for:`;
                        for (let i = 0; i < to_list.length; i++) {
                            const scheduled_for = convert_time(to_list[i].sched);
                            let delay = fix_delay(to_list[i].delay);

                            let adjust_time = to_list[i].corr
                            if (adjust_time ==''){
                                adjust_time = scheduled_for;
                            }
                            else{
                                adjust_time = convert_time(adjust_time)
                            }
                            let wait_time = to_list[i].wait;
                            if (wait_time == ''){
                                wait_time = '> 90 min'
                            }
                            //console.log(wait_time)
                            const vehicle = to_list[i].model;
                            //formatted_message += `\n\n# ${to_list[i].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\nDelay: **${delay}\nArrival time including delay: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**\nDoes this bus have AC? **${has_AC(to_list[i].model)}**`;
                            formatted_message += `\n\n# ${to_list[i].trip}.\n\n**Details:**\nScheduled for: **${scheduled_for}**\n${delay}\nAdjusted arrival time: **${adjust_time}**\nWait: **${wait_time}**\nVehicle: **${vehicle}**`;
                        }
                    }
                    //const formatted_message = `The next departing bus for [${mainPageData.title}](https://tcomm.bustrainferry.com/mobile/stop/${stopID}) is for:\n**${mainPageData.scheduleData[1].trip}.**\n\n**Details:**\nScheduled for: **${convert_time(mainPageData.scheduleData[1].sched)}**\nCorrected time: **${convert_time(mainPageData.scheduleData[1].corr)}**\nDelay: **${mainPageData.scheduleData[1].delay} min**\nWait: **${mainPageData.scheduleData[1].wait}**\nVehicle: **${mainPageData.scheduleData[1].model}**\nDoes this bus have AC? **${has_AC(mainPageData.scheduleData[1].model)}**`;

                    await interaction.editReply(formatted_message);
                }
            } catch (error) {
                console.error('Error fetching the main page:', error);
                await interaction.editReply('That stop does not exist!');
                return;
            }
        };
        getDataFromMainPage();

        //interaction.reply(`The stop is ${stopID}`);
    }
});

//client.login(process.env.TOKEN);
client.login(TOKEN);
