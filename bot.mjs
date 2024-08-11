import irc from 'irc-upd';
import chokidar from 'chokidar';
import fs from 'fs';
import readline from 'readline';

// INFO DEL SERVIDOR
const config = {
    server: "irc.tchatzone.fr",
    port: 6697,  // ssl
    botName: "DeBuG",
    userName: 'DeBuG',
    realName: 'DeBuG v.1.2',
    debug: true,
    autoConnect: true,
    channels: ['#servicios'],
    secure: true,  // ssl
    selfSigned: true,  // certs 
    certExpired: false,  // certs
};

const bot = new irc.Client(config.server, config.botName, {
    userName: config.userName,
    realName: config.realName,
    port: config.port,
    secure: config.secure,
    selfSigned: config.selfSigned,
    certExpired: config.certExpired,
    debug: config.debug,
    autoConnect: config.autoConnect,
    channels: config.channels
});

// Timer
const cooldownPeriod = 2000; // Cooldown period in milliseconds (2 seconds)
let lastSpamFilterMessageTime = 0; // Time when the last SPAMFILTER_MATCH message was sent

// COLORES ANSI
const green = '\u000303'; // Verde
const reset = '\u0003'; // Reseteo
const red = '\u000304'; // Rojo
const ctcpTimestamps = {};

bot.on('registered', () => {
    console.log(`${green}Connected and registered.${reset}`);
    bot.join(config.channels[0], () => {
        console.log(`${green}Joined channel ${config.channels[0]}${reset}`);
    });
    setTimeout(() => {
        bot.send("CAP", "REQ", "unrealircd.org/json-log");
    }, 20000);  // 20 DELAY
});

bot.on('cap', (message) => {
    console.log('Capability message received:', message);
    if (message.arguments.includes('ACK') && message.arguments[2].includes('unrealircd.org/json-log')) {
        console.log(`${green}Capability 'unrealircd.org/json-log' successfully enabled.${reset}`);
        bot.say(config.channels[0], `${green}JSON logging capability is now active and working!${reset}`);
    } else if (message.arguments.includes('NAK')) {
        console.error(`${green}Failed to enable 'unrealircd.org/json-log'. Server rejected the request.${reset}`);
        bot.say(config.channels[0], `${green}Error: Unable to activate JSON logging capability.${reset}`);
    }
});

// File monitoring setup
const logFile = '/path/to/fail2ban.log';  // Adjust the path to your Fail2Ban log file
let fileWatcher = null;

function setupFileWatcher(filePath) {
    fileWatcher = chokidar.watch(filePath, { ignored: /^\./, persistent: true });
    fileWatcher.on('add', path => console.log(`File ${path} has been added`))
        .on('change', path => readNewLines(path));
}

function readNewLines(filePath) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', flags: 'r' });
    const rl = readline.createInterface({
        input: stream
    });

    rl.on('line', (line) => {
        if (line.trim().length > 0) {  // Ensure the line isn't empty
            bot.say(config.channels[0], line);
        }
    });

    rl.on('close', () => {
        console.log('Finished reading file updates.');
    });
}

// CTCP VERSION CON LIMITE Y DEBUG
bot.on('ctcp', (from, to, text, type) => {
    if (type === 'privmsg' && text === 'VERSION') {
        const currentTime = Date.now();
        const timeLimit = 3600000; // 1 HORA EN MILISEC

        if (ctcpTimestamps[from] && (currentTime - ctcpTimestamps[from] < timeLimit)) {
            console.log(`Ignoring CTCP VERSION request from ${from} due to rate limiting.`);
            bot.say(config.channels[0], `${red}L'UTILISATEUR${reset}: ${from} A ÉTÉ IGNORÉ PENDANT 1 HEURE RAISON : INONDATION CTCP (VERSION).`);
            return; // iGNORA EL PEDIDO
        }

        // MONITOREA ULTIMO CTCP POR USUARIO
        ctcpTimestamps[from] = currentTime;

        console.log(`CTCP VERSION request received from ${from}`);
        bot.ctcp(from, 'notice', 'VERSION: DeBuG monitor v.1.0');
        bot.say(config.channels[0], `${red}J'AI RÉPONDU À UNE VERSION DUN UTILISATEUR - CTCP${reset}: ${from}.`);
    }
});

bot.on('raw', (message) => {
    console.log('Raw message received:', message);
    if (message.rawCommand.startsWith('@unrealircd.org/json-log')) {
        try {
            const jsonStart = message.rawCommand.indexOf('{');
            let jsonString = message.rawCommand.substring(jsonStart);
            jsonString = jsonString.replace(/\\s/g, ' ');

            const jsonData = JSON.parse(jsonString);
            console.log('Processed JSON Data:', jsonData);
            const extendedInfo = jsonData.extended_client_info || '';
            const classMatch = extendedInfo.match(/\[class: ([^\]]+)\]/);
            const clientClass = classMatch ? classMatch[1] : 'unknown';

            // USUARIO LOCAL CONECTADO
            if (jsonData.subsystem === 'connect' && jsonData.event_id === 'LOCAL_CLIENT_CONNECT') {
                const connectMessage = `${green}CONECTA${reset}: [${jsonData.client.name}] ${green}ID${reset}: ${jsonData.client.id} ${green}PUERTO${reset}: ${jsonData.client.server_port} ${green}IP${reset}: *@${jsonData.client.ip} ${green}SERVIDOR${reset}: [${jsonData.client.user.servername}] ${green}ASN${reset}: ${jsonData.client.geoip.asn} ${green}ASN-name${reset}: [${jsonData.client.geoip.asname}] ${green}TIPO${reset}: ${clientClass} ${green}CUENTA NiCK${reset}: ${jsonData.client.user.account}`;
                bot.say(config.channels[0], connectMessage);
            }
            if (jsonData.subsystem === 'connect' && jsonData.event_id === 'LOCAL_CLIENT_DISCONNECT') {
                const connectMessage = `${red}DESCONECTA${reset}: ${jsonData.client.name} ${red}ID${reset}: ${jsonData.client.id} ${red}PUERTO${reset}: ${jsonData.client.server_port} ${red}IP${reset}: *@${jsonData.client.ip} ${red}SERVIDOR${reset}: ${jsonData.client.user.servername} ${red}TIPO${reset}: ${clientClass} ${red}DETALLES${reset}: ${jsonData.client.details}`;
                bot.say(config.channels[0], connectMessage);
            }
            // USUARIO REMOTO CONECTADO
            if (jsonData.subsystem === 'connect' && jsonData.event_id === 'REMOTE_CLIENT_CONNECT') {
                const connectMessage = `${green}CONECTA${reset}: ${jsonData.client.name} ${green}ID${reset}: ${jsonData.client.id} ${green}SERVIDOR${reset}: ${jsonData.client.user.servername} ${green}IP${reset}: *@${jsonData.client.ip} ${green}DETALLES${reset}: ${jsonData.client.details}`;
                bot.say(config.channels[0], connectMessage);
            }
            if (jsonData.subsystem === 'connect' && jsonData.event_id === 'REMOTE_CLIENT_DISCONNECT') {
                const connectMessage = `${red}DESCONECTA${reset}: ${jsonData.client.name} ${red}ID${reset}: ${jsonData.client.id} ${red}IP${reset}: *@${jsonData.client.ip} ${red}SERVIDOR${reset}: ${jsonData.client.user.servername}  ${red}DETALLES${reset}: ${jsonData.client.details}`;
                bot.say(config.channels[0], connectMessage);
            }
            // INGRESO A CANALES
            if (jsonData.subsystem === 'join' && jsonData.event_id === 'LOCAL_CLIENT_JOIN') {
                // Check if client and channel data are available in jsonData
                if (jsonData.client && jsonData.channel && jsonData.client.name && jsonData.channel.name) {
                    const joinMessage = `${green}CHaN${reset}: ${jsonData.client.name} ${green}INGRESA AL CANAL${reset}: ${jsonData.channel.name}`;
                    bot.say(config.channels[0], joinMessage);
                } else {
                    console.error('Missing client or channel data in JSON');
                }
            }
            // SALIDA DE CANALES
            if (jsonData.subsystem === 'part' && jsonData.event_id === 'LOCAL_CLIENT_PART') {
                // Check if client and channel data are available in jsonData
                if (jsonData.client && jsonData.channel && jsonData.client.name && jsonData.channel.name) {
                    const partMessage = `${red}CHaN${reset}: ${jsonData.client.name} ${red}SALE DEL CANAL${reset}: ${jsonData.channel.name}`;
                    bot.say(config.channels[0], partMessage);
                } else {
                    console.error('Missing client or channel data in JSON');
                }
            }
            // INGRESO A CANALES REMOTO
            if (jsonData.subsystem === 'join' && jsonData.event_id === 'REMOTE_CLIENT_JOIN') {
                // Check if client and channel data are available in jsonData
                if (jsonData.client && jsonData.channel && jsonData.client.name && jsonData.channel.name) {
                    const joinMessage = `${green}CHaN${reset}: ${jsonData.client.name} ${green}INGRESA AL CANAL${reset}: ${jsonData.channel.name}`;
                    bot.say(config.channels[0], joinMessage);
                } else {
                    console.error('Missing client or channel data in JSON');
                }
            }
            // SALIDA DE CANALES REMOTO
            if (jsonData.subsystem === 'part' && jsonData.event_id === 'REMOTE_CLIENT_PART') {
                // Check if client and channel data are available in jsonData
                if (jsonData.client && jsonData.channel && jsonData.client.name && jsonData.channel.name) {
                    const partMessage = `${red}CHaN${reset}: ${jsonData.client.name} ${red}SALE DEL CANAL${reset}: ${jsonData.channel.name}`;
                    bot.say(config.channels[0], partMessage);
                } else {
                    console.error('Missing client or channel data in JSON');
                }
            }
            // IRCOP DETECTADO EN LA RED
            if (jsonData.subsystem === 'oper' && jsonData.event_id === 'OPER_SUCCESS') {
                // Ensure client data and the required operational details are present in jsonData
                if (jsonData.client && jsonData.client.name && jsonData.client.user.operclass) {
                    const operMessage = `${green}OPeR${reset}: ${jsonData.client.name} ${green}HA SIDO RECONOCIDO COMO OPERADOR DE LA RED${reset}: ${jsonData.client.user.operclass}`;
                    bot.say(config.channels[0], operMessage);
                } else {
                    console.error('Missing client or operational data in JSON');
                }
            }

            // BANS
            if (jsonData.subsystem === 'tkl' && jsonData.event_id === 'TKL_ADD') {
                const tklMessage = `${red}[USUARIO BANEADO]${reset}: ${red} ID${reset}: ${jsonData.event_id} ${red}HOSTNAME${reset}: ${jsonData.tkl.name} ${red}TIPO${reset} ${jsonData.tkl.type_string} ${red}MOTIVO${reset}: ${jsonData.tkl.reason} ${red}PUESTO POR${reset}: ${jsonData.tkl.set_by} ${red}EXPIRA EL${reset}: ${jsonData.tkl.expire_at_string}`;
                bot.say(config.channels[0], tklMessage);
            }
            // SPAMFILTERS
            if (jsonData.subsystem === 'tkl' && jsonData.event_id === 'SPAMFILTER_MATCH') {
                const currentTime = Date.now();
                if (currentTime - lastSpamFilterMessageTime > cooldownPeriod) {
                    const tklMessage = `${red}[SPAM DETECTADO]${reset} ${red} ID${reset}: ${jsonData.event_id} ${red}USUARIO${reset}: ${jsonData.client.details} ${red}STRING${reset} ${jsonData.tkl.type_string} ${red}TIPO${reset} ${jsonData.tkl.match_type} ${red}FILTRO${reset}: ${jsonData.tkl.name} ${red}HIT${reset}: ${jsonData.tkl.hits} ${red}RESPUESTA DEL SERVIDOR${reset}: ${jsonData.tkl.reason}`;
                    bot.say(config.channels[0], tklMessage);
                    lastSpamFilterMessageTime = currentTime; // Update the time of the last sent message
                } else {
                    console.log(`Cooldown active. Message not sent to prevent duplication.`);
                }
            }

        } catch (error) {
            console.error('Failed to parse JSON from message:', error);
        }
    }
});

bot.on('error', (message) => {
    console.error('ERROR:', message);
});

bot.connect();