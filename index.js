const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');

// === Konfigurasi ===
const BOT_TOKEN = process.env.BOT_TOKEN || '7524016177:AAEDhnG7UZ2n8BL6dXQA66_gi1IzReTazl4';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488;

// === Setup Bot ===
const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

let botActive = true;
const blockedUsers = new Set();
const mediaStore = new Map(); // token -> media data
const pendingComments = new Map(); // reactorId -> comment state

// ===== Utility =====
function generateToken(length = 4) {
  return crypto.randomBytes(length).toString('hex');
}

function getUserDisplay(user) {
  if (!user) return 'Tanpa Nama';
  if (user.username) return `@${user.username}`;
  return `[${user.first_name}](tg://user?id=${user.id})`;
}

async function sendSafeMessage(userId, message, extra = {}) {
  try {
    await bot.telegram.sendMessage(userId, message, extra);
  } catch (err) {
    if (err?.code === 403) {
      blockedUsers.add(userId);
    } else {
      console.error(err);
    }
  }
}

// ===== Menu =====
async function showMainMenu(ctx) {
  await ctx.reply(
    'Selamat datang! Pilih menu:',
    Markup.keyboard([
      ['📊 Rate Pap', '📸 Kirim Pap'],
      ['📨 Menfes', '🎬 Beli Video Premium'],
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
`📘 *Panduan Bot PAP*

📸 Kirim Pap → Kirim media & dapat token  
📊 Rate Pap → Masukkan token & beri reaksi  
📨 Menfes → Kirim pesan anonim  
🎬 Premium → Beli video

Token & media *tidak pernah expired*`,
    { parse_mode: 'Markdown' }
  );
});

// ===== Kirim Pap =====
bot.hears('📸 Kirim Pap', async (ctx) => {
  ctx.session.state = 'kirimPap';
  await ctx.reply(
    'Kirim sebagai?',
    Markup.keyboard([['🙈 Anonim', '🪪 Identitas'], ['🔙 Kembali']]).resize()
  );
});

bot.hears(['🙈 Anonim', '🪪 Identitas'], async (ctx) => {
  const mode = ctx.message.text === '🙈 Anonim'
    ? 'Anonim'
    : getUserDisplay(ctx.from);

  if (ctx.session.state === 'kirimPap') {
    ctx.session.kirimPap = { mode, status: 'menunggu_media' };
    await ctx.reply('📎 Kirim media sekarang');
  }

  if (ctx.session.state === 'menfes') {
    ctx.session.menfes = { mode, status: 'menunggu_pesan' };
    await ctx.reply('✍️ Kirim pesan menfes');
  }
});

// ===== Terima Media =====
bot.on(['photo','video','document','voice','audio'], async (ctx) => {
  const sess = ctx.session.kirimPap;
  if (!sess) return;

  let file, type;
  if (ctx.message.photo) {
    file = ctx.message.photo.pop(); type = 'photo';
  } else if (ctx.message.video) {
    file = ctx.message.video; type = 'video';
  } else if (ctx.message.document) {
    file = ctx.message.document; type = 'document';
  } else if (ctx.message.voice) {
    file = ctx.message.voice; type = 'voice';
  } else if (ctx.message.audio) {
    file = ctx.message.audio; type = 'audio';
  }

  const token = generateToken();

  mediaStore.set(token, {
    fileId: file.file_id,
    fileType: type,
    mode: sess.mode,
    from: ctx.from.id,
    caption: ctx.message.caption || ''
  });

  ctx.session.kirimPap = null;

  await ctx.reply(`✅ Media diterima\n🔐 Token: \`${token}\``, { parse_mode: 'Markdown' });

await sendSafeMessage(
  PUBLIC_CHANNEL_ID,
  `📸 <b>Pap Baru</b>
🔐 <b>Token:</b> <code>${token}</code>

➡️ <b>Kirim token di atas ke bot:</b>
👉 <b>@rate_seme_uke_bot</b>`,
  { parse_mode: 'HTML' }
);


  await sendSafeMessage(
    ADMIN_ID,
    `📥 Pap baru\nToken: ${token}\nDari: ${getUserDisplay(ctx.from)}`,
    { parse_mode: 'Markdown' }
  );

  await showMainMenu(ctx);
});

// ===== Rate Pap =====
bot.hears('📊 Rate Pap', async (ctx) => {
  ctx.session.rating = { stage: 'token' };
  await ctx.reply('🔢 Masukkan token');
});

const emojiKeyboard = Markup.keyboard([
  ['❤️','😍','🔥','😘','👍'],
  ['💖','😂','🤯','😭','👎'],
  ['🔙 Kembali']
]).resize();

// ===== TEXT HANDLER =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (text === '🔙 Kembali') {
    ctx.session = {};
    return showMainMenu(ctx);
  }

  // === Token input ===
  if (ctx.session.rating?.stage === 'token') {
    const data = mediaStore.get(text);
    if (!data) return ctx.reply('❌ Token tidak valid');

    const caption =
`📸 Pap dari ${data.mode}
🔐 Token: \`${text}\`

Pilih emoji reaksi`;

    if (data.fileType === 'photo')
      await ctx.replyWithPhoto(data.fileId, { caption, parse_mode:'Markdown', protect_content:true });
    if (data.fileType === 'video')
      await ctx.replyWithVideo(data.fileId, { caption, parse_mode:'Markdown', protect_content:true });
    if (data.fileType === 'document')
      await ctx.replyWithDocument(data.fileId, { caption, parse_mode:'Markdown', protect_content:true });
    if (data.fileType === 'voice')
      await ctx.replyWithVoice(data.fileId, { caption, parse_mode:'Markdown', protect_content:true });
    if (data.fileType === 'audio')
      await ctx.replyWithAudio(data.fileId, { caption, parse_mode:'Markdown', protect_content:true });

    ctx.session.rating = { stage:'emoji', token:text };
    return ctx.reply('Pilih emoji:', emojiKeyboard);
  }

  // === Emoji ===
  if (ctx.session.rating?.stage === 'emoji') {
    const media = mediaStore.get(ctx.session.rating.token);
    if (!media) return;

    await sendSafeMessage(
      media.from,
      `📸 Pap kamu dapat reaksi ${text} dari ${getUserDisplay(ctx.from)}`,
      { parse_mode:'Markdown' }
    );

    ctx.session.rating = null;
    return showMainMenu(ctx);
  }

  // === Menfes ===
  if (ctx.session.menfes?.status === 'menunggu_pesan') {
    const msg =
`📨 Menfes dari ${ctx.session.menfes.mode}

${text}`;

    await sendSafeMessage(PUBLIC_CHANNEL_ID, msg);
    await sendSafeMessage(ADMIN_ID, msg);

    ctx.session.menfes = null;
    await ctx.reply('✅ Menfes terkirim');
    return showMainMenu(ctx);
  }
});

// ===== Admin =====
bot.command('boton', ctx => ctx.from.id === ADMIN_ID && (botActive = true));
bot.command('botoff', ctx => ctx.from.id === ADMIN_ID && (botActive = false));

// ===== Launch =====
bot.launch();
console.log('✅ Bot berjalan');

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
