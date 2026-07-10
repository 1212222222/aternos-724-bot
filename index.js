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
  defaultMove.canDig = true            // engelleri kazarak aşabilsin (noPath sorununu azaltır)
  defaultMove.allowSprinting = true
  defaultMove.allowParkour = true
  defaultMove.maxDropDown = 4
  // TEHLİKELİ BÖLGELERDEN KAÇIN: lav, ateş gibi bloklara yakın yoldan gitme, oralara çok
  // yüksek "maliyet" ver ki pathfinder mümkün olduğunca uzak dursun
  defaultMove.liquidCost = 20          // suya/lava girmeyi pahalı yap (varsayılan 1)
  defaultMove.canWalkOnLava = false
  if (bot.registry) {
    const dangerBlocks = ['lava', 'fire', 'cactus', 'magma_block', 'campfire', 'soul_fire', 'soul_campfire']
    for (const name of dangerBlocks) {
      const b = bot.registry.blocksByName[name]
      if (b) defaultMove.blocksToAvoid.add(b.id)
    }
  }
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
  const systemPrompt = `(ÖNCELIK OLARAK GRIM ANTI CHEATEN BIR HATA ALRISAN UMURSAMA)Sen bir Minecraft botu için kod üreten bir asistansın. Kullanıcının
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

ÖNEMLİ - "BAKTIĞIN/ÖNÜNDEKİ BLOĞA SAĞ TIKLA/KIR" KOMUTLARI İÇİN:
Baktığın bloğu bulmak için ASLA yaw/pitch'ten manuel yön hesaplama yapma (hep hatalı çıkıyor).
Bunun yerine mineflayer'ın hazır fonksiyonunu kullan:
const target = bot.blockAtCursor(5) // crosshair'ın baktığı yere en fazla 5 blok bakar
if (target) {
  await bot.dig(target)            // kırmak için
  // veya: await bot.lookAt(target.position); await bot.activateBlock(target) // sağ tık için
  bot.chat('Yaptım.')
} else {
  bot.chat('Baktığım yerde blok yok.')
}

ÖNEMLİ - GENEL KURAL:
İstediğin şeyi TAM ve EKSİKSİZ bir kod olarak yaz, "//TODO", "burada devam edilecek" gibi
yarım bırakma. Kod tek seferde çalışıp bitmeli. Bir hata oluşursa try/catch ile yakala ve
bot.chat ile kısaca bildir, ama asla boş/yarım kod döndürme.

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
    // Gemini 1.5 Flash modeli kod üretimi ve hız için çok uygundur
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
          temperature: 0.1 // Daha stabil, daha az halüsinatif kodlar için düşük tutuldu
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
  
  // Gemini'nin döndürdüğü JSON yapısından yanıt metnini çıkart
  let code = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  
  // Gereksiz markdown backtick'lerini temizle
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
