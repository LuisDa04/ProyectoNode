const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const token = '8200132161:AAFQfkY7GeP-dAQLbxD5jdOSlIznkWnVC30';     
const channelId = '@mytestbot001'; 

const app = express();
const bot = new TelegramBot(token);
app.use(express.json());

app.post(`/webhook/${token}`, (req, res) => {
    const msg = req.body.message;

    if (msg && msg.text) {
        const text = msg.text;

        if (text && (text.startsWith('Los resultados') || text.startsWith('Los Ganadores'))) {
            bot.sendMessage(channelId, text)
                .then(() => console.log(`✅ Mensaje publicado: ${text}`))
                .catch(err => console.error('❌ Error al enviar:', err.message));
        } else if (text) {
            console.log(`⏩ Mensaje ignorado: ${text}`);
        }
    }
    res.sendStatus(200);
});

const setWebhook = async () => {
    const webhookUrl = `https://proyectonode-41qd.onrender.com/webhook/${token}`;
    try {
        await bot.setWebHook(webhookUrl);
        console.log(`Webhook configurado correctamente en: ${webhookUrl}`);
    } catch (error) {
        console.error('Error al configurar el webhook:', error);
    }
};

const port = process.env.PORT || 3000;
app.listen(port, async () => {
    console.log(`Servidor iniciado en el puerto ${port}`);
    await setWebhook();
});