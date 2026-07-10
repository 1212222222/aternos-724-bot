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
  const modelName = "gemini-2.5-flash"; // Listenin içindeki tam isim
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
  
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
`.`;

  try {
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
      const err = await response.text();
      console.error('[API HATASI]', err);
      return "bot.chat('API Hatası')";
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text.replace(/```javascript|```js|```/g, '').trim() || '';
  } catch (err) {
    return "bot.chat('Ağ hatası')";
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
