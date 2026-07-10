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
  const systemPrompt = `Sen bir Minecraft botu için kod üreten bir asistansın. Kullanıcının
mesajını, mineflayer kütüphanesini kullanarak bota o anda ne yapması gerektiğini söyleyen bir
JAVASCRIPT KOD PARÇASI olarak yaz. SADECE kod döndür, açıklama yazma, markdown backtick kullanma.

Kodun çalışacağı ortamda şu değişkenler hazır (require etmene gerek yok):
- bot: mineflayer bot nesnesi 
- goals: mineflayer-pathfinder goals modülü 
- Vec3: koordinat/vektör sınıfı
- username: mesajı yazan oyuncunun adı ("${username}")

Kodun async context içinde çalışacak, istersen await kullanabilirsin.
Hata olursa try/catch ile yakalayıp bot.chat ile kullanıcıya kısaca bildir.

Botun şu anki durumu:
- Konum: ${JSON.stringify(bot.entity?.position)}
- Envanter: ${bot.inventory?.items().map(i => i.name).join(', ') || 'boş'}
- Yakındaki oyuncular: ${Object.keys(bot.players).join(', ')}
`

  let response
// index.js içindeki askAI fonksiyonunun içindeki fetch bloğunu bununla değiştir:

  try {
    // Model ismi doğrudan gemini-2.5-flash olarak ayarlandı.
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            parts: [{ text: `${username}: ${message}` }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.1 
        }
      })
    })
  } catch (networkErr) {
    console.error('[AI] AĞ HATASI:', networkErr)
    return "bot.chat('Ağ hatası oldu.')"
  }

  console.log('[AI] HTTP status:', response.status)

  if (!response.ok) {
    const errBody = await response.text()
    console.error('[AI] API HATASI:', response.status, errBody)
    return "bot.chat('AI hatası oldu, konsola bak.')"
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
