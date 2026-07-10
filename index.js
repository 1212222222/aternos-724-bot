/**
 * AI destekli Minecraft botu
 * - Sohbetten gelen HER doğal dil komutunu anlar (hazır/sabit komut listesi YOK)
 * - Groq API'ye "bu isteği karşılayan JS kodunu yaz" diye sorar
 * - AI'nin ürettiği kodu doğrudan bot üzerinde çalıştırır (mineflayer'ın tüm API'sine erişimi var)
 */

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

// ---- AYARLAR ----
const HOST = process.env.MC_HOST || 'localhost'
const PORT = parseInt(process.env.MC_PORT || '25565')
const USERNAME = process.env.MC_USERNAME || 'AIBot'
const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!GROQ_API_KEY) {
  console.error('HATA: GROQ_API_KEY ortam değişkeni ayarlı değil.')
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
  defaultMove.canDig = true           // engelleri kazarak aşabilsin (noPath sorununu azaltır)
  defaultMove.allowSprinting = true
  defaultMove.allowParkour = true
  defaultMove.maxDropDown = 4
  bot.pathfinder.setMovements(defaultMove)
  bot.pathfinder.thinkTimeout = 5000  // yol hesaplaması için daha fazla süre, takılıp titremesin
  bot.chat('Merhaba! Bana istediğin şeyi yaz, ne olursa olsun yapmaya çalışacağım.')
  startAntiAfk()
})

// Bazı sunucular normal 'chat' event'i yerine ham mesaj paketi gönderebiliyor, debug için loglayalım
bot.on('message', (jsonMsg) => {
  console.log('[RAW MESSAGE]', jsonMsg.toString())
})

// Pathfinder'ın neden takıldığını görmek için debug logları
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

// ---- ANTİ-AFK: Aternos hareketsiz oyuncuyu atabiliyor, bunu engelle ----
function startAntiAfk() {
  setInterval(() => {
    if (!bot.entity) return
    // Bot aktif bir hedefe gidiyorsa (takip, gitme vb.) anti-afk'nın araya girip
    // ekstra titremeye sebep olmasını engelle
    if (bot.pathfinder.goal) return
    if (!bot.pathfinder.isMoving()) {
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 300)
      bot.look(bot.entity.yaw + 0.5, bot.entity.pitch, true)
    }
  }, 60 * 1000)
}

// ---- SOHBET DİNLEYİCİ: HER MESAJI AI'YA GÖNDER, AI KOD YAZAR, BİZ ÇALIŞTIRIRIZ ----
bot.on('chat', async (username, message) => {
  console.log(`[CHAT] ${username}: ${message}`)
  if (username === bot.username) return

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

// ---- AI'DAN DOĞRUDAN ÇALIŞTIRILABİLİR JS KODU İSTE ----
async function askAI(username, message) {
  const systemPrompt = `Sen bir Minecraft botu için kod üreten bir asistansın. Kullanıcının
mesajını, mineflayer kütüphanesini kullanarak bota o anda ne yapması gerektiğini söyleyen bir
JAVASCRIPT KOD PARÇASI olarak yaz. SADECE kod döndür, açıklama yazma, markdown backtick kullanma.

Kodun çalışacağı ortamda şu değişkenler hazır (require etmene gerek yok):
- bot: mineflayer bot nesnesi (bot.chat, bot.dig, bot.attack, bot.equip, bot.craft,
  bot.pathfinder, bot.findBlock, bot.nearestEntity, bot.blockAt, bot.inventory, bot.entity,
  bot.players, bot.registry, bot.sleep, vb. tüm mineflayer API'si kullanılabilir)
- goals: mineflayer-pathfinder goals modülü (goals.GoalBlock, goals.GoalFollow, goals.GoalNear vb.)
- Vec3: koordinat/vektör sınıfı, örn: new Vec3(x, y, z)
- username: mesajı yazan oyuncunun adı ("${username}")

Kodun async context içinde çalışacak, istersen await kullanabilirsin.
Bilmediğin bir istek gelirse (örn: "yatakta yat", "elindekini at", "şu oyuncuya odun ver"),
mineflayer'ın ilgili fonksiyonlarını kullanarak mantıklı bir çözüm üret. Elinden geleni yap,
asla "yapamam" deme, en yakın karşılığı bul ve dene. Hata olursa try/catch ile yakalayıp
bot.chat ile kullanıcıya kısaca bildir.

Örnek istek: "beni takip et"
Örnek kod:
try {
  const target = bot.players[username]?.entity
  if (target) {
    bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true)
    bot.chat('Seni takip ediyorum.')
  } else {
    bot.chat('Seni göremiyorum.')
  }
} catch (e) {
  bot.chat('Takip edemedim: ' + e.message)
}
NOT: Takip etme isteklerinde GoalFollow'un ikinci parametresini (dynamic) MUTLAKA true yap,
yoksa bot hedefin peşinden gitmeyi bırakır ve olduğu yerde titreyip durur (patinaj çeker).
"dur" / "takibi bırak" gibi isteklerde bot.pathfinder.setGoal(null) kullan.

Örnek istek: "sağındaki yatağa yat"
Örnek kod:
try {
  const bed = bot.findBlock({ matching: (b) => b.name.includes('bed'), maxDistance: 8 })
  if (bed) {
    await bot.pathfinder.goto(new goals.GoalNear(bed.position.x, bed.position.y, bed.position.z, 1))
    await bot.sleep(bed)
    bot.chat('Yattım.')
  } else {
    bot.chat('Yakında yatak bulamadım.')
  }
} catch (e) {
  bot.chat('Yatamadım: ' + e.message)
}

ÖNEMLİ - TAKİP ETME (follow) KOMUTLARI İÇİN:
"beni takip et" gibi isteklerde ASLA GoalFollow'u çok küçük mesafeyle kullanma, bot hedefe
yapışıp ileri-geri salınır (titreme/patinaj yapar). Mesafe olarak EN AZ 3 kullan (2 veya altı
titremeye sebep olur). Doğru kullanım:
const target = bot.players[username]?.entity
if (target) {
  const goal = new goals.GoalFollow(target, 3) // minimum 3 blok mesafe, daha az VERME
  bot.pathfinder.setGoal(goal, true) // true = dinamik, hedef hareket ettikçe günceller
  bot.chat('Seni takip ediyorum.')
} else {
  bot.chat('Seni göremiyorum.')
}

ÖNEMLİ - "BANA GEL" / "BURAYA GEL" KOMUTLARI İÇİN:
ASLA GoalBlock ile oyuncunun TAM DURDUĞU koordinata gitmeye çalışma — o blok zaten oyuncu
tarafından işgal edilmiş durumda, bot oraya giremez ve "noPath" hatası alırsın. Bunun yerine
GoalNear kullan (oyuncunun 1-2 blok yakınına kadar gelmesi yeterli):
const target = bot.players[username]?.entity
if (target) {
  const p = target.position
  await bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, 1))
  bot.chat('Geldim.')
} else {
  bot.chat('Seni göremiyorum.')
}
Ayrıca bot dar bir koridorda/kapı önünde takılıp zıplamaya devam ediyorsa, bu genelde
Movements ayarlarıyla ilgilidir, kod tarafında yapılacak bir şey yok, olduğu gibi bırak.

Botun şu anki durumu:
- Konum: ${JSON.stringify(bot.entity?.position)}
- Envanter: ${bot.inventory?.items().map(i => i.name).join(', ') || 'boş'}
- Yakındaki oyuncular: ${Object.keys(bot.players).join(', ')}
`

  let response
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${username}: ${message}` }
        ]
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
  console.log('[AI] Ham cevap:', JSON.stringify(data).slice(0, 500))

  let code = data.choices?.[0]?.message?.content || ''
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
  console.log('Sunucudan atıldım:', reason)
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

// Üretilen kodun içindeki try/catch'i atlayan gecikmeli (async) hatalar botu tamamen
// çökertmesin diye process seviyesinde de yakalıyoruz.
process.on('unhandledRejection', (reason) => {
  console.error('[YAKALANMAMIŞ HATA - promise]', reason)
  try { bot.chat('Bir şey ters gitti ama devam ediyorum.') } catch {}
})
process.on('uncaughtException', (err) => {
  console.error('[YAKALANMAMIŞ HATA - exception]', err)
  try { bot.chat('Bir şey ters gitti ama devam ediyorum.') } catch {}
})
