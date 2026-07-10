/**
 * AI destekli Minecraft botu (Gemini API Entegrasyonu)
 * - Sohbetten gelen HER doğal dil komutunu anlar (hazır/sabit komut listesi YOK)
 * - Gemini API'ye "bu isteği karşılayan JS kodunu yaz" diye sorar
 * - AI'nin ürettiği kodu doğrudan bot üzerinde çalıştırır (mineflayer'ın tüm API'sine erişimi var)
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
  console.log('[SPAWN] Bot sunucuya girdi, konum:', bot.entity.position)
  const defaultMove = new Movements(bot)
  defaultMove.canOpenDoors = true
  defaultMove.canDig = true            
  
  // GRIM ANTI-CHEAT KORUMASI: Hızlı koşma ve zıplayarak ilerleme kapatıldı.
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
  bot.chat('Merhaba! Bana istediğin şeyi yaz, ne olursa olsun yapmaya çalışacağım.')
  startAntiAfk()
})

bot.on('message', (jsonMsg) => {
  console.log('[RAW MESSAGE]', jsonMsg.toString())
})

bot.on('path_update', (r) => {
  console.log('[PATH] status:', r.status, '| path uzunluğu:', r.path?.length)
  if (r.status === 'noPath') {
    console.log('[PATH] Bot konumu:', bot.entity.position)
    const goal = bot.pathfinder.goal
    console.log('[PATH] Hedef goal:', JSON.stringify(goal))
  }
})
bot.on('goal_reached', () => {
  console.log('[PATH] Hedefe ulaşıldı.')
})

// ---- ANTİ-AFK GÜNCELLEMESİ ----
function startAntiAfk() {
  setInterval(() => {
    if (!bot.entity) return
    if (bot.pathfinder.goal) return
    if (!bot.pathfinder.isMoving()) {
      // Grim'e takılmamak için zıplama iptal edildi, sadece çömelip kalkacak ve etrafa bakacak.
      bot.setControlState('sneak', true)
      setTimeout(() => bot.setControlState('sneak', false), 300)
      bot.look(bot.entity.yaw + 0.5, bot.entity.pitch, true)
    }
  }, 60 * 1000)
}

// ---- SOHBET DİNLEYİCİ ----
bot.on('chat', async (username, message) => {
  console.log(`[CHAT] ${username}: ${message}`)
  
  if (username === bot.username) return
  
  if (username.toLowerCase().includes('grim') || message.includes('failed TickTimer')) {
    console.log('[KORUMA] Grim Anti-Cheat mesajı yoksayıldı.')
    return
  }

  try {
    console.log('[AI] Mesaj gönderiliyor...')
    const code = await askAI(username, message)
    console.log('[AI] Üretilen kod:\n' + code)
    await runGeneratedCode(code, username)
  } catch (err) {
    console.error('[HATA]', err)
    bot.chat('Bir hata oldu, konsolu kontrol et.')
  }
})

// ---- AI'DAN KOD İSTE ----
async function askAI(username, message) {
  const modelName = "gemini-2.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
  
  console.log('[DEBUG] İstek atılan URL:', url);

  const systemPrompt = `Sen bir Minecraft botusun. SADECE JavaScript kodu döndür. Açıklama yazma.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: `${username}: ${message}` }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.1 }
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[API HATASI]', response.status, errBody);
    return "bot.chat('API Hatası - Konsola bak.')";
  }

  const data = await response.json();
  let code = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return code.replace(/```javascript|```js|```/g, '').trim();
}

  const data = await response.json()
  
  let code = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  
  code = code.replace(/```javascript|```js|```/g, '').trim()
  return code
}

// ---- ÜRETİLEN KODU ÇALIŞTIR ----
async function runGeneratedCode(code, username) {
  try {
    const fn = new Function('bot', 'goals', 'Vec3', 'username', `
      return (async () => {
        ${code}
      })()
    `)
    await fn(bot, goals, Vec3, username)
  } catch (err) {
    console.error('[KOD ÇALIŞTIRMA HATASI]', err)
    bot.chat('Bu isteği çalıştıramadım: ' + err.message)
  }
}

bot.on('kicked', (reason) => {
  console.log('Sunucudan atıldım:', JSON.stringify(reason, null, 2))
  process.exit(1)
})
bot.on('error', (err) => {
  console.log('Bağlantı hatası:', err)
  process.exit(1)
})
bot.on('end', () => {
  console.log('Bağlantı sona erdi.')
  process.exit(0)
})

process.on('unhandledRejection', (reason) => {
  console.error('[YAKALANMAMIŞ HATA - promise]', reason)
  try { bot.chat('Bir şey ters gitti ama devam ediyorum.') } catch {}
})
process.on('uncaughtException', (err) => {
  console.error('[YAKALANMAMIŞ HATA - exception]', err)
  try { bot.chat('Bir şey ters gitti ama devam ediyorum.') } catch {}
})
