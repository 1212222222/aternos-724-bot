/**
 * AI destekli Minecraft botu
 * - Sohbetten gelen HER doğal dil komutunu anlar (hazır komut listesi yok)
 * - Anthropic API'yi kullanarak komutu "primitive" aksiyonlara çevirir
 * - Mineflayer + pathfinder ile hareket, kazma, savaşma, craft yapar
 */

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

// ---- AYARLAR ----
const HOST = process.env.MC_HOST || 'localhost'
const PORT = parseInt(process.env.MC_PORT || '25565')
const USERNAME = process.env.MC_USERNAME || 'AIBot'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY // .env veya ortam değişkeninden

if (!ANTHROPIC_API_KEY) {
  console.error('HATA: ANTHROPIC_API_KEY ortam değişkeni ayarlı değil.')
  process.exit(1)
}

const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: USERNAME,
  version: false // otomatik sürüm algıla
})

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  const defaultMove = new Movements(bot)
  bot.pathfinder.setMovements(defaultMove)
  bot.chat('Merhaba! Bana istediğin şeyi yaz, anlamaya çalışacağım.')
  startAntiAfk()
})

// ---- ANTİ-AFK: Aternos hareketsiz oyuncuyu atabiliyor, bunu engelle ----
function startAntiAfk() {
  setInterval(() => {
    if (!bot.entity) return
    if (!bot.pathfinder.isMoving()) {
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 300)
      bot.look(bot.entity.yaw + 0.5, bot.entity.pitch, true)
    }
  }, 60 * 1000) // her 1 dakikada bir
}

// ---- BOTUN YAPABİLDİĞİ TEMEL AKSİYONLAR (primitives) ----
// AI, bunları kombinleyerek karmaşık istekleri karşılar.
const actions = {
  gotoPlayer: async ({ player }) => {
    const target = bot.players[player]?.entity
    if (!target) return bot.chat(`${player} görünmüyor.`)
    const goal = new goals.GoalFollow(target, 2)
    bot.pathfinder.setGoal(goal, true)
  },

  gotoCoords: async ({ x, y, z }) => {
    bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
  },

  mineBlock: async ({ blockName, count = 1 }) => {
    for (let i = 0; i < count; i++) {
      const block = bot.findBlock({
        matching: b => b.name === blockName,
        maxDistance: 32
      })
      if (!block) return bot.chat(`${blockName} bulamadım.`)
      await bot.pathfinder.goto(new goals.GoalBlock(block.position.x, block.position.y, block.position.z))
      await bot.dig(block)
    }
    bot.chat(`${count} adet ${blockName} kazıldı.`)
  },

  attackEntity: async ({ entityName }) => {
    const entity = bot.nearestEntity(e => e.name === entityName)
    if (!entity) return bot.chat(`${entityName} yakında yok.`)
    bot.pvp?.attack ? bot.pvp.attack(entity) : bot.attack(entity)
  },

  craftItem: async ({ itemName, count = 1 }) => {
    const item = bot.registry.itemsByName[itemName]
    if (!item) return bot.chat(`${itemName} tanımlı değil.`)
    const recipe = bot.recipesFor(item.id, null, 1, null)[0]
    if (!recipe) return bot.chat(`${itemName} için tarif bulunamadı (crafting table gerekebilir).`)
    await bot.craft(recipe, count, null)
    bot.chat(`${count} adet ${itemName} craft edildi.`)
  },

  say: async ({ message }) => {
    bot.chat(message)
  },

  followPlayer: async ({ player }) => actions.gotoPlayer({ player }),

  stop: async () => {
    bot.pathfinder.setGoal(null)
    bot.chat('Durdum.')
  }
}

// ---- SOHBET DİNLEYİCİ: HER MESAJI AI'YA GÖNDER ----
bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  try {
    const plan = await askAI(username, message)
    for (const step of plan) {
      const fn = actions[step.action]
      if (fn) {
        await fn(step.args || {})
      } else {
        bot.chat(`Bilmediğim aksiyon: ${step.action}`)
      }
    }
  } catch (err) {
    console.error(err)
    bot.chat('Bir hata oldu, konsolu kontrol et.')
  }
})

// ---- ANTHROPIC API İLE DOĞAL DİLİ AKSİYON PLANINA ÇEVİR ----
async function askAI(username, message) {
  const systemPrompt = `Sen bir Minecraft botusun. Kullanıcıdan gelen mesajı, aşağıdaki primitive
aksiyonların bir dizisine (array) çevir. SADECE JSON array döndür, başka hiçbir şey yazma.

Mevcut aksiyonlar:
- gotoPlayer {player}
- gotoCoords {x,y,z}
- mineBlock {blockName, count}
- attackEntity {entityName}
- craftItem {itemName, count}
- say {message}
- stop {}

Örnek çıktı:
[{"action":"mineBlock","args":{"blockName":"oak_log","count":5}},{"action":"say","args":{"message":"Odun toplandı!"}}]

Botun şu anki durumu:
- Konum: ${JSON.stringify(bot.entity?.position)}
- Envanter: ${bot.inventory?.items().map(i => i.name).join(', ') || 'boş'}
- Yakındaki oyuncular: ${Object.keys(bot.players).join(', ')}
`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: `${username}: ${message}` }]
    })
  })

  const data = await response.json()
  const text = data.content?.map(c => c.text || '').join('') || '[]'
  const cleaned = text.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('AI JSON parse edilemedi:', text)
    return []
  }
}

bot.on('kicked', (reason) => {
  console.log('Sunucudan atıldım:', reason)
  process.exit(1) // workflow bir sonraki job'da yeniden bağlanacak
})
bot.on('error', (err) => {
  console.log('Bağlantı hatası:', err)
  process.exit(1)
})
bot.on('end', () => {
  console.log('Bağlantı sona erdi.')
  process.exit(0)
})
