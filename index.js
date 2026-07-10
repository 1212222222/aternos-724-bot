const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const HOST = process.env.MC_HOST || 'localhost'
const PORT = parseInt(process.env.MC_PORT || '25565')
const USERNAME = process.env.MC_USERNAME || 'AIBot'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  console.error('HATA: GEMINI_API_KEY ortam değişkeni ayarlı değil.')
  process.exit(1)
}

const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: USERNAME,
  version: false
})

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  console.log('[SPAWN] Bot sunucuya girdi')
  const defaultMove = new Movements(bot)
  defaultMove.allowSprinting = false   
  defaultMove.allowParkour = false     
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Merhaba! Gemini 2.5 Flash ile hazırım.')
})

async function askAI(username, message) {
  const systemPrompt = `Sen bir Minecraft botusun. SADECE JavaScript kodu döndür. Açıklama yazma.`
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: `${username}: ${message}` }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.1 }
      })
    });
    if (!response.ok) return "bot.chat('API Hatası')"
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text.replace(/```javascript|```js|```/g, '').trim() || ''
  } catch (err) {
    return "bot.chat('Ağ hatası')"
  }
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  const code = await askAI(username, message)
  try {
    const fn = new Function('bot', 'goals', 'Vec3', 'username', `return (async () => { ${code} })()`)
    await fn(bot, goals, Vec3, username)
  } catch (err) {
    bot.chat('Kod çalışmadı.')
  }
})
