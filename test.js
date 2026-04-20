const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const { States, setUserState, getUserState, clearUserState } = require('./userStates'); // Importamos el gestor de estados

const token = process.env.BOT_TOKEN;
const channelId = process.env.CHANNEL_ID;

const app = express();
app.use(express.json());
const bot = new TelegramBot(token);


// Verifica si un usuario está registrado por su chatId
function isUserRegistered(chatId, callback) {
  db.get('SELECT * FROM users WHERE chatId = ?', [chatId], (err, row) => {
    if (err) return callback(false);
    callback(!!row);
  });
}

// Verifica si un usuario tiene una sesión activa
function isUserLoggedIn(chatId, callback) {
  db.get('SELECT isLoggedIn FROM users WHERE chatId = ?', [chatId], (err, row) => {
    if (err) return callback(false);
    callback(row && row.isLoggedIn === 1);
  });
}

// Muestra el menú principal después del login
function showMainMenu(chatId) {
  bot.sendMessage(chatId, '✅ Has iniciado sesión correctamente. Usa /logout para cerrar sesión.');
}

// --- Comandos y Lógica del Bot ---

// Comando /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  isUserRegistered(chatId, (registered) => {
    if (!registered) {
      // Si no está registrado, mostramos opciones
      bot.sendMessage(chatId, 'Bienvenido. ¿Qué deseas hacer?', {
        reply_markup: {
          keyboard: [['📝 Registrarse', '🔑 Iniciar Sesión']],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
    } else {
      // Si está registrado, verificamos si tiene sesión activa
      isUserLoggedIn(chatId, (loggedIn) => {
        if (!loggedIn) {
          bot.sendMessage(chatId, 'Ya tienes una cuenta. Usa /login para iniciar sesión.');
        } else {
          showMainMenu(chatId);
        }
      });
    }
  });
});

// Comando /register
bot.onText(/\/register|📝 Registrarse/, (msg) => {
  const chatId = msg.chat.id;
  isUserRegistered(chatId, (registered) => {
    if (registered) {
      return bot.sendMessage(chatId, 'Ya estás registrado. Usa /login para iniciar sesión.');
    }
    setUserState(chatId, States.AWAITING_REGISTER_USERNAME);
    bot.sendMessage(chatId, '📝 Por favor, elige un nombre de usuario:');
  });
});

// Comando /login
bot.onText(/\/login|🔑 Iniciar Sesión/, (msg) => {
  const chatId = msg.chat.id;
  isUserRegistered(chatId, (registered) => {
    if (!registered) {
      return bot.sendMessage(chatId, 'No estás registrado. Usa /register primero.');
    }
    isUserLoggedIn(chatId, (loggedIn) => {
      if (loggedIn) {
        return bot.sendMessage(chatId, 'Ya tienes una sesión activa.');
      }
      setUserState(chatId, States.AWAITING_LOGIN_USERNAME);
      bot.sendMessage(chatId, '🔑 Por favor, ingresa tu nombre de usuario:');
    });
  });
});

// Comando /logout
bot.onText(/\/logout/, (msg) => {
  const chatId = msg.chat.id;
  db.run('UPDATE users SET isLoggedIn = 0 WHERE chatId = ?', [chatId], (err) => {
    if (err) {
      return bot.sendMessage(chatId, '❌ Error al cerrar sesión.');
    }
    bot.sendMessage(chatId, '👋 Has cerrado sesión correctamente. Usa /start para volver a empezar.');
  });
});

// --- Manejador de Mensajes (para el flujo de registro/login) ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const stateObj = getUserState(chatId);

  // Si el usuario está en medio de un proceso, lo manejamos aquí.
  if (stateObj) {
    const { state, tempData } = stateObj;

    // Proceso de Registro: Esperando nombre de usuario
    if (state === States.AWAITING_REGISTER_USERNAME) {
      const username = text.trim();
      // Validación simple: sin espacios
      if (username.includes(' ')) {
        return bot.sendMessage(chatId, '❌ El nombre de usuario no puede contener espacios. Intenta de nuevo:');
      }
      // Verificamos si el nombre ya existe
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (row) {
          return bot.sendMessage(chatId, '❌ Ese nombre de usuario ya existe. Por favor, elige otro:');
        }
        // Guardamos temporalmente el username y pasamos al siguiente estado
        setUserState(chatId, States.AWAITING_REGISTER_PASSWORD, { username });
        bot.sendMessage(chatId, '🔐 Ahora, ingresa tu contraseña:');
      });
      return;
    }

    // Proceso de Registro: Esperando contraseña
    if (state === States.AWAITING_REGISTER_PASSWORD) {
      const password = text.trim();
      if (password.length < 4) {
        return bot.sendMessage(chatId, '❌ La contraseña debe tener al menos 4 caracteres. Intenta de nuevo:');
      }
      const { username } = tempData;
      // Guardamos el usuario en la base de datos
      db.run('INSERT INTO users (chatId, username, password, isLoggedIn) VALUES (?, ?, ?, ?)',
        [chatId, username, password, 1], (err) => {
          if (err) {
            console.error(err);
            return bot.sendMessage(chatId, '❌ Error al registrar. Por favor, intenta de nuevo.');
          }
          clearUserState(chatId);
          bot.sendMessage(chatId, `✅ ¡Registro exitoso! Bienvenido, ${username}. Ya has iniciado sesión automáticamente.`);
          showMainMenu(chatId);
      });
      return;
    }

    // Proceso de Login: Esperando nombre de usuario
    if (state === States.AWAITING_LOGIN_USERNAME) {
      const username = text.trim();
      db.get('SELECT * FROM users WHERE username = ? AND chatId = ?', [username, chatId], (err, row) => {
        if (!row) {
          return bot.sendMessage(chatId, '❌ Nombre de usuario no encontrado. Intenta de nuevo:');
        }
        setUserState(chatId, States.AWAITING_LOGIN_PASSWORD, { username });
        bot.sendMessage(chatId, '🔐 Ingresa tu contraseña:');
      });
      return;
    }

    // Proceso de Login: Esperando contraseña
    if (state === States.AWAITING_LOGIN_PASSWORD) {
      const password = text.trim();
      const { username } = tempData;
      db.get('SELECT * FROM users WHERE username = ? AND password = ? AND chatId = ?', [username, password, chatId], (err, row) => {
        if (!row) {
          return bot.sendMessage(chatId, '❌ Contraseña incorrecta. Intenta de nuevo:');
        }
        // Actualizamos el estado de login a true
        db.run('UPDATE users SET isLoggedIn = 1 WHERE chatId = ?', [chatId], (err) => {
          if (err) {
            return bot.sendMessage(chatId, '❌ Error al iniciar sesión.');
          }
          clearUserState(chatId);
          bot.sendMessage(chatId, `✅ ¡Bienvenido de nuevo, ${username}!`);
          showMainMenu(chatId);
        });
      });
      return;
    }
  }

  // Si no hay un estado activo y el mensaje es de texto, verificamos si es para publicar en el canal
  if (text && (text.startsWith('Los resultados') || text.startsWith('Los Ganadores'))) {
    // Verificamos que el usuario tenga sesión activa
    isUserLoggedIn(chatId, (loggedIn) => {
      if (loggedIn) {
        bot.sendMessage(channelId, text)
          .then(() => console.log(`✅ Mensaje publicado: ${text}`))
          .catch(err => console.error('❌ Error al enviar:', err.message));
      } else {
        bot.sendMessage(chatId, 'Debes iniciar sesión para publicar mensajes en el canal. Usa /login');
      }
    });
  } else if (text && !stateObj) {
    // Mensaje que no es un comando y no coincide con el estado, ignoramos
    console.log(`⏩ Mensaje ignorado: ${text}`);
  }
});

// --- Configuración del Webhook (igual que antes) ---
const setWebhook = async () => {
  const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook/${token}`;
  await bot.setWebHook(webhookUrl);
  console.log(`Webhook configurado en ${webhookUrl}`);
};

const port = process.env.PORT || 3000;
app.post(`/webhook/${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Servidor iniciado en el puerto ${port}`);
  setWebhook();
});