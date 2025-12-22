const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');

// === Konfigurasi ===
const BOT_TOKEN = process.env.BOT_TOKEN || '7524016177:AAEDhnG7UZ2n8BL6dXQA66_gi1IzReTazl4';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488;

// === Setup Bot ===
const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

const mediaStore = new Map();

// ===== Utility =====
function generateToken(length = 4) {
  return crypto.randomBytes(length).toString('hex');
}

function getUserDisplay(user) {
  if (!user) return 'Anonim';
  if (user.username) return `@${user.username}`;
  return `[${user.first_name}](tg://user?id=${user.id})`;
}

// Escape MarkdownV2 characters
function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

async function sendSafeMessage(id, text, extra = {}) {
  try {
    if (extra.parse_mode === 'MarkdownV2') {
      text = escapeMarkdownV2(text);
    }
    await bot.telegram.sendMessage(id, text, extra);
  } catch (e) { console.log(e); }
}

// ===== Menu Utama =====
async function showMainMenu(ctx) {
  await ctx.reply(
    '🏠 Menu Utama',
    Markup.keyboard([
      ['📊 Rate Pap', '📸 Kirim Pap'],
      ['📨 Menfes', '🎬 VIP Video'],
      ['ℹ️ Help']
    ]).resize()
  );
}

// ===== START =====
bot.start(async (ctx) => {
  ctx.session = {};
  await showMainMenu(ctx);
});

// ===== HELP =====
bot.hears('ℹ️ Help', async (ctx) => {
  await ctx.reply(
`📘 *Panduan Bot*

📸 Kirim Pap → Kirim media & dapat token  
📊 Rate Pap → Masukkan token & beri reaksi + komentar opsional  
📨 Menfes → Kirim pesan anonim / identitas  

🎬 VIP Video → Beli channel VIP video murah

🔙 Kembali = batal & ulang`,
    { parse_mode: 'Markdown' }
  );
});

// ===== KIRIM PAP =====
bot.hears('📸 Kirim Pap', async (ctx) => {
  ctx.session = {};
  ctx.session.state = 'kirimPap';

  await ctx.reply(
    'Kirim sebagai?',
    Markup.keyboard([['🙈 Anonim', '🪪 Identitas'], ['🔙 Kembali']]).resize()
  );
});

bot.hears(['🙈 Anonim', '🪪 Identitas'], async (ctx) => {
  if (!ctx.session.state) return;

  if (ctx.session.state === 'kirimPap') {
    ctx.session.kirimPap = {
      mode: ctx.message.text === '🙈 Anonim' ? 'Anonim' : getUserDisplay(ctx.from)
    };
    await ctx.reply('📎 Kirim media sekarang');
  }

  if (ctx.session.state === 'menfes') {
    ctx.session.menfes = {
      mode: ctx.message.text === '🙈 Anonim' ? 'Anonim' : getUserDisplay(ctx.from)
    };
    await ctx.reply('Kirim pesan menfes (hanya teks/link)');
  }
});

// ===== TERIMA MEDIA PAP =====
bot.on(['photo','video','document','voice','audio'], async (ctx) => {
  if (!ctx.session.kirimPap) return;

  let file, type;
  if (ctx.message.photo) { file = ctx.message.photo.pop(); type = 'photo'; }
  if (ctx.message.video) { file = ctx.message.video; type = 'video'; }
  if (ctx.message.document) { file = ctx.message.document; type = 'document'; }
  if (ctx.message.voice) { file = ctx.message.voice; type = 'voice'; }
  if (ctx.message.audio) { file = ctx.message.audio; type = 'audio'; }

  const token = generateToken();

  mediaStore.set(token, {
    fileId: file.file_id,
    fileType: type,
    from: ctx.from.id,
    mode: ctx.session.kirimPap.mode
  });

  // Kirim ke channel publik dengan escape MarkdownV2
  await sendSafeMessage(
    PUBLIC_CHANNEL_ID,
    `📸 PAP Baru
🔐 Token: \`${token}\`
Kirim token ke @rate_seme_uke_bot`,
    { parse_mode: 'MarkdownV2' }
  );

  // Kirim info pengirim ke admin
  await sendSafeMessage(ADMIN_ID,
    `📸 PAP dari ${getUserDisplay(ctx.from)}\nToken: ${token}`
  );

  ctx.session = {};
  await ctx.reply(`✅ Media diterima\n🔐 Token: \`${token}\``, { parse_mode: 'Markdown' });
  await showMainMenu(ctx);
});

// ===== RATE PAP =====
bot.hears('📊 Rate Pap', async (ctx) => {
  ctx.session = {};
  ctx.session.rating = { stage: 'token' };

  await ctx.reply(
    '🔢 Silahkan kirim token PAP',
    Markup.keyboard([['🔙 Kembali']]).resize()
  );
});

// Keyboard emoji 4x4
const emojiKeyboard = Markup.keyboard([
  ['❤️','😍','🔥','👍'],
  ['👎','😂','😭','🤯'],
  ['🔙 Kembali']
]).resize();

// ===== TEKS HANDLER =====
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text;

  if (text === '🔙 Kembali') {
    ctx.session = {};
    await ctx.reply('🔄 Dibatalkan');
    return showMainMenu(ctx);
  }

  if (ctx.session.rating?.stage === 'token') {
    const media = mediaStore.get(text);
    if (!media) return ctx.reply('❌ Token tidak valid');

    const caption =
`📸 Pap dari ${media.mode}
🔐 Token: \`${text}\`

Pilih reaksi`;

    // Kirim media ke user untuk rating
    const options = { caption, parse_mode: 'Markdown', protect_content: true };
    if (media.fileType === 'photo') await ctx.replyWithPhoto(media.fileId, options);
    if (media.fileType === 'video') await ctx.replyWithVideo(media.fileId, options);
    if (media.fileType === 'document') await ctx.replyWithDocument(media.fileId, options);
    if (media.fileType === 'voice') await ctx.replyWithVoice(media.fileId, options);
    if (media.fileType === 'audio') await ctx.replyWithAudio(media.fileId, options);

    ctx.session.rating.stage = 'emoji';
    ctx.session.rating.token = text;
    return ctx.reply('Pilih emoji:', emojiKeyboard);
  }

  if (ctx.session.rating?.stage === 'emoji') {
    const media = mediaStore.get(ctx.session.rating.token);
    if (!media) return;

    await sendSafeMessage(
      media.from,
      `📸 Pap kamu mendapat reaksi ${text} dari ${getUserDisplay(ctx.from)}`,
      { parse_mode: 'Markdown' }
    );

    ctx.session.rating.stage = 'comment';
    ctx.session.rating.emoji = text;
    return ctx.reply(
      '📝 Kirim komentar atau pilih tidak kirim / kembali',
      Markup.keyboard([
        ['Kirim komentar', 'Tidak kirim'],
        ['🔙 Kembali']
      ]).resize()
    );
  }

  if (ctx.session.rating?.stage === 'comment') {
    const media = mediaStore.get(ctx.session.rating.token);
    if (!media) return;

    if (text === 'Kirim komentar') {
      ctx.session.rating.stage = 'write_comment';
      return ctx.reply('📝 Silahkan tulis komentar kamu:');
    }

    if (ctx.session.rating.stage === 'write_comment') {
      await sendSafeMessage(
        media.from,
        `💬 Komentar untuk Pap kamu: ${text} dari ${getUserDisplay(ctx.from)}`
      );
      ctx.session = {};
      return showMainMenu(ctx);
    }

    if (text === 'Tidak kirim') {
      ctx.session = {};
      return showMainMenu(ctx);
    }
  }

  if (ctx.session.menfes) {
    await sendSafeMessage(PUBLIC_CHANNEL_ID,
      `📨 Menfes dari ${ctx.session.menfes.mode}:\n\n${text}`
    );

    await sendSafeMessage(ADMIN_ID,
      `📨 Menfes dari ${getUserDisplay(ctx.from)}:\n${text}`
    );

    ctx.session = {};
    await ctx.reply('✅ Menfes terkirim');
    return showMainMenu(ctx);
  }

  return next();
});

// ===== MENFES =====
bot.hears('📨 Menfes', async (ctx) => {
  ctx.session = {};
  ctx.session.state = 'menfes';

  await ctx.reply(
    'Kirim sebagai?',
    Markup.keyboard([['🙈 Anonim', '🪪 Identitas'], ['🔙 Kembali']]).resize()
  );
});

// ===== VIP VIDEO =====
bot.hears('🎬 VIP Video', async (ctx) => {
  await ctx.reply('Beli channel VIP video murah di @vvip_3_bot');
});

// ===== LAUNCH =====
bot.launch();
console.log('✅ Bot berjalan');

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
