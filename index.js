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

async function sendSafeMessage(id, text, extra = {}) {
  try {
    await bot.telegram.sendMessage(id, text, extra);
  } catch {}
}

// ===== Menu =====
async function showMainMenu(ctx) {
  await ctx.reply(
    '🏠 Menu Utama',
    Markup.keyboard([
      ['📊 Rate Pap', '📸 Kirim Pap'],
      ['📨 Menfes'],
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
📊 Rate Pap → Masukkan token & beri reaksi  
📨 Menfes → Kirim pesan anonim  

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
  if (ctx.session.state !== 'kirimPap') return;

  ctx.session.kirimPap = {
    mode: ctx.message.text === '🙈 Anonim'
      ? 'Anonim'
      : getUserDisplay(ctx.from)
  };

  await ctx.reply('📎 Kirim media sekarang');
});

// ===== TERIMA MEDIA =====
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

  ctx.session = {};

  await ctx.reply(`✅ Media diterima\n🔐 Token: \`${token}\``, { parse_mode: 'Markdown' });

  await sendSafeMessage(
    PUBLIC_CHANNEL_ID,
`📸 <b>PAP Baru</b>
🔐 <code>${token}</code>

Kirim token ke bot untuk rate`,
    { parse_mode: 'HTML' }
  );

  await showMainMenu(ctx);
});

// ===== RATE PAP (RESET TOTAL) =====
bot.hears('📊 Rate Pap', async (ctx) => {
  ctx.session = {}; // 🔥 RESET TOTAL
  ctx.session.rating = { stage: 'token' };

  await ctx.reply(
    '🔢 Silahkan kirim token PAP',
    Markup.keyboard([['🔙 Kembali']]).resize()
  );
});

// ===== KEYBOARD EMOJI =====
const emojiKeyboard = Markup.keyboard([
  ['❤️','😍','🔥','👍','👎'],
  ['😂','😭','🤯'],
  ['🔙 Kembali']
]).resize();

// ===== TEXT HANDLER =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  // === KEMBALI (RESET TOTAL) ===
  if (text === '🔙 Kembali') {
    ctx.session = {};
    await ctx.reply('🔄 Dibatalkan');
    return showMainMenu(ctx);
  }

  // === INPUT TOKEN ===
  if (ctx.session.rating?.stage === 'token') {
    const media = mediaStore.get(text);
    if (!media) return ctx.reply('❌ Token tidak valid');

    const caption =
`📸 Pap dari ${media.mode}
🔐 Token: \`${text}\`

Pilih reaksi`;

    if (media.fileType === 'photo')
      await ctx.replyWithPhoto(media.fileId, { caption, parse_mode:'Markdown' });
    if (media.fileType === 'video')
      await ctx.replyWithVideo(media.fileId, { caption, parse_mode:'Markdown' });
    if (media.fileType === 'document')
      await ctx.replyWithDocument(media.fileId, { caption, parse_mode:'Markdown' });
    if (media.fileType === 'voice')
      await ctx.replyWithVoice(media.fileId, { caption, parse_mode:'Markdown' });
    if (media.fileType === 'audio')
      await ctx.replyWithAudio(media.fileId, { caption, parse_mode:'Markdown' });

    ctx.session.rating = { stage: 'emoji', token: text };
    return ctx.reply('Pilih emoji:', emojiKeyboard);
  }

  // === EMOJI ===
  if (ctx.session.rating?.stage === 'emoji') {
    const media = mediaStore.get(ctx.session.rating.token);
    if (!media) return;

    await sendSafeMessage(
      media.from,
      `📸 Pap kamu mendapat reaksi ${text} dari ${getUserDisplay(ctx.from)}`,
      { parse_mode: 'Markdown' }
    );

    ctx.session = {};
    return showMainMenu(ctx);
  }
});

// ===== MENFES =====
bot.hears('📨 Menfes', async (ctx) => {
  ctx.session = {};
  ctx.session.menfes = true;

  await ctx.reply(
    'Kirim pesan menfes',
    Markup.keyboard([['🔙 Kembali']]).resize()
  );
});

bot.on('text', async (ctx, next) => {
  if (!ctx.session.menfes) return next();

  await sendSafeMessage(PUBLIC_CHANNEL_ID, `📨 Menfes:\n\n${ctx.message.text}`);
  ctx.session = {};
  await ctx.reply('✅ Menfes terkirim');
  return showMainMenu(ctx);
});

// ===== LAUNCH =====
bot.launch();
console.log('✅ Bot berjalan');

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
