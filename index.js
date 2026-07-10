/**
 * AI destekli Minecraft botu (Gemini 3.5 Flash Entegrasyonu)
 */

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

// ---- AYARLAR ----
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
  defaultMove.canOpenDoors = true
  defaultMove.canDig = true            
  defaultMove.allowSprinting = false   
  defaultMove.allowParkour = false     
  defaultMove.maxDropDown = 3
  
  defaultMove.liquidCost = 20          
  defaultMove.canWalkOnLava = false
  if (bot.registry) {
    const dangerBlocks = ['lava', 'fire', 'cactus', 'magma_block', 'campfire', 'soul_fire', 'soul_campfire']
    for (const name of dangerBlocks) {
      const b = bot.registry.blocksByName[name]
      if (b) defaultMove.blocksToAvoid.add(b.id)
    }
  }
  bot.pathfinder.setMovements(defaultMove)
  bot.pathfinder.thinkTimeout = 5000  
  bot.chat('Merhaba! Gemini 3.5 ile çalışıyorum.')
  startAntiAfk()
})

// ---- ANTİ-AFK ----
function startAntiAfk() {
  setInterval(() => {
    if (!bot.entity || bot.pathfinder.goal) return
    if (!bot.pathfinder.isMoving()) {
      bot.setControlState('sneak', true)
      setTimeout(() => bot.setControlState('sneak', false), 300)
      bot.look(bot.entity.yaw + 0.5, bot.entity.pitch, true)
    }
  }, 60 * 1000)
}

// ---- SOHBET DİNLEYİCİ ----
bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  if (username.toLowerCase().includes('grim') || message.includes('failed TickTimer')) return

  try {
    const code = await askAI(username, message)
    await runGeneratedCode(code, username)
  } catch (err) {
    console.error('[HATA]', err)
  }
})

// ---- AI'DAN KOD İSTE (Gemini 3.5 Flash) ----
async function askAI(username, message) {
  const systemPrompt = `Sen bir Minecraft botu için kod üreten bir asistansın. Mineflayer kullanarak JS kodu yaz. SADECE kod döndür, açıklama yazma.`

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: `${username}: ${message}` }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.1 }
    })
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('[API HATASI]', err)
    return "bot.chat('API Hatası')"
  }

  const data = await response.json()
  let code = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return code.replace(/```javascript|```js|```/g, '').trim()
}

// ---- ÜRETİLEN KODU ÇALIŞTIR ----
async function runGeneratedCode(code, username) {
  try {
    const fn = new Function('bot', 'goals', 'Vec3', 'username', `return (async () => { ${code} })()`)
    await fn(bot, goals, Vec3, username)
  } catch (err) {
    bot.chat('Kod çalıştırılamadı.')
  }
}

bot.on('kicked', (reason) => process.exit(1))
bot.on('error', (err) => process.exit(1))
