import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { useMultiFileAuthState, makeWASocket, Browsers } from '@whiskeysockets/baileys';
import axios from 'axios';
import multer from 'multer';
import pino from 'pino';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files like index.html

let sessionFolder = `./auth/session`;
if (fs.existsSync(sessionFolder)) {
  try {
    fs.rmdirSync(sessionFolder, { recursive: true });
    console.log('Deleted the "SESSION" folder.');
  } catch (err) {
    console.error('Error deleting the "SESSION" folder:', err);
  }
}

async function startWhatsAppSession(phone) {
  const authDir = path.join(__dirname, 'auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir);
  }

  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(sessionFolder)) {
        await fs.mkdirSync(sessionFolder);
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
      const negga = makeWASocket({
        version: [2, 3000, 1015901307],
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu("Chrome"),
        auth: state,
      });

      negga.ev.on('creds.update', saveCreds);

      negga.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          console.log('Connected to WhatsApp Servers');
          resolve(negga);
        }

        if (connection === 'close') {
          let reason = lastDisconnect?.error?.output?.statusCode;
          if (reason === 'connectionClosed' || reason === 'connectionLost') {
            console.log('[Connection Lost, Reconnecting....]');
            process.send('reset');
          } else {
            console.log('[Server Disconnected]');
          }
        }
      });
    } catch (error) {
      console.error('Error starting WhatsApp session:', error);
      reject(error);
    }
  });
}

async function changeWhatsAppDP(negga, imageBuffer) {
  try {
    await negga.setProfilePicture(negga.user.id, imageBuffer);
    console.log('Profile picture updated successfully!');
  } catch (error) {
    console.error('Error changing profile picture:', error);
    throw new Error('Failed to change profile picture');
  }
}

app.post('/change-dp', upload.single('image'), async (req, res) => {
  const { imageUrl } = req.body;
  const imageFile = req.file;

  if (!imageUrl && !imageFile) {
    return res.status(400).json({ error: 'No image provided.' });
  }

  try {
    const phone = req.body.phone;
    const negga = await startWhatsAppSession(phone);

    let imageBuffer;

    if (imageUrl) {
      // Download image from URL
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(response.data, 'binary');
    } else if (imageFile) {
      // Read the image file uploaded by the user
      imageBuffer = fs.readFileSync(imageFile.path);
    }

    await changeWhatsAppDP(negga, imageBuffer);

    res.json({ success: true });
  } catch (error) {
    console.error('Error changing profile picture:', error);
    res.status(500).json({ error: 'Failed to change profile picture.' });
  }
});

app.listen(8000, () => {
  console.log('API Running on PORT: 8000');
});
