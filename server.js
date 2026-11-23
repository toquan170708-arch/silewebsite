const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, "store.json");
const SECRET = process.env.SESSION_SECRET || "dev-only-change-this-secret";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const STORE_NAME = process.env.STORE_NAME || "Cửa hàng của bạn";

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch {
    const initial = { products: [], orders: [], customers: [], admins: [], settings: { storeName: STORE_NAME, description: "Chào mừng bạn đến với cửa hàng." } };
    writeDB(initial);
    return initial;
  }
}
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
let db = readDB();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
if (!db.admins.length) {
  db.admins.push({ id: crypto.randomUUID(), name: "Quản trị viên", email: ADMIN_EMAIL, passwordHash: hashPassword(ADMIN_PASSWORD), role: "owner" });
  writeDB(db);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function unsign(token) {
  try {
    const [body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", SECRET).update(body).digest();
    const actual = Buffer.from(sig, "base64url");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function auth(req, res, next) {
  const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("store_session="))?.split("=")[1];
  const session = token ? unsign(decodeURIComponent(token)) : null;
  if (!session) return res.status(401).json({ error: "Vui lòng đăng nhập." });
  req.user = session;
  next();
}
function adminOnly(req, res, next) {
  if (!req.user || !["owner", "admin", "staff"].includes(req.user.role)) return res.status(403).json({ error: "Không có quyền truy cập." });
  next();
}
function cleanProduct(p) {
  return { id: p.id, name: p.name, description: p.description || "", price: Number(p.price) || 0, image: p.image || "", category: p.category || "Chưa phân loại", stock: Number(p.stock) || 0, active: p.active !== false };
}
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) });

app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(ROOT, "public")));

app.get("/api/store", (_, res) => res.json({ name: db.settings.storeName, description: db.settings.description }));
app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "");
  res.json(db.products.filter(p => p.active && (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q)) && (!category || p.category === category)).map(cleanProduct));
});
app.get("/api/categories", (_, res) => res.json([...new Set(db.products.filter(p => p.active).map(p => p.category))]));

app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || String(password).length < 8) return res.status(400).json({ error: "Nhập đủ thông tin; mật khẩu tối thiểu 8 ký tự." });
  if (db.customers.some(c => c.email === String(email).toLowerCase())) return res.status(409).json({ error: "Email đã được sử dụng." });
  const customer = { id: crypto.randomUUID(), name: String(name), email: String(email).toLowerCase(), passwordHash: hashPassword(String(password)), createdAt: new Date().toISOString() };
  db.customers.push(customer); writeDB(db);
  res.json({ ok: true });
});
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const normalized = String(email || "").toLowerCase();
  const user = db.admins.find(x => x.email === normalized) || db.customers.find(x => x.email === normalized);
  if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
  const role = user.role || "customer";
  const token = sign({ id: user.id, name: user.name, email: user.email, role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.setHeader("Set-Cookie", `store_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ ok: true, role, name: user.name });
});
app.post("/api/logout", (_, res) => {
  res.setHeader("Set-Cookie", "store_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) => res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }));

app.post("/api/orders", (req, res) => {
  const { customerName, phone, address, items, note } = req.body || {};
  if (!customerName || !phone || !address || !Array.isArray(items) || !items.length) return res.status(400).json({ error: "Vui lòng nhập thông tin giao hàng và sản phẩm." });
  const lines = [];
  for (const item of items) {
    const product = db.products.find(p => p.id === item.id && p.active);
    const qty = Math.max(1, Math.min(99, Number(item.quantity) || 1));
    if (!product || product.stock < qty) return res.status(400).json({ error: `Sản phẩm "${product?.name || "không tồn tại"}" không đủ hàng.` });
    lines.push({ productId: product.id, name: product.name, price: product.price, quantity: qty });
  }
  const total = lines.reduce((s, x) => s + x.price * x.quantity, 0);
  lines.forEach(x => { const p = db.products.find(y => y.id === x.productId); p.stock -= x.quantity; });
  const order = { id: `DH${Date.now()}`, customerName, phone, address, note: note || "", items: lines, total, status: "Mới", createdAt: new Date().toISOString() };
  db.orders.unshift(order); writeDB(db);
  res.json({ ok: true, orderId: order.id, total });
});

app.get("/api/admin/summary", auth, adminOnly, (_, res) => res.json({
  products: db.products.length, orders: db.orders.length, customers: db.customers.length,
  revenue: db.orders.filter(o => o.status !== "Đã hủy").reduce((s, o) => s + o.total, 0)
}));
app.get("/api/admin/products", auth, adminOnly, (_, res) => res.json(db.products.map(cleanProduct)));
app.post("/api/admin/products", auth, adminOnly, (req, res) => {
  const p = cleanProduct({ ...req.body, id: crypto.randomUUID() });
  if (!p.name.trim()) return res.status(400).json({ error: "Tên sản phẩm không được để trống." });
  db.products.unshift(p); writeDB(db); res.json(p);
});
app.put("/api/admin/products/:id", auth, adminOnly, (req, res) => {
  const i = db.products.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
  db.products[i] = cleanProduct({ ...db.products[i], ...req.body, id: req.params.id }); writeDB(db); res.json(db.products[i]);
});
app.delete("/api/admin/products/:id", auth, adminOnly, (req, res) => {
  db.products = db.products.filter(p => p.id !== req.params.id); writeDB(db); res.json({ ok: true });
});
app.post("/api/admin/upload", auth, adminOnly, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF dưới 5MB." });
  res.json({ url: `/uploads/${req.file.filename}` });
});
app.get("/api/admin/orders", auth, adminOnly, (_, res) => res.json(db.orders));
app.patch("/api/admin/orders/:id", auth, adminOnly, (req, res) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
  const allowed = ["Mới", "Đang xử lý", "Đang giao", "Hoàn thành", "Đã hủy"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Trạng thái không hợp lệ." });
  order.status = req.body.status; writeDB(db); res.json(order);
});
app.get("/api/admin/customers", auth, adminOnly, (_, res) => res.json(db.customers.map(({passwordHash, ...c}) => c)));
app.put("/api/admin/settings", auth, adminOnly, (req, res) => {
  db.settings.storeName = String(req.body.storeName || STORE_NAME).slice(0, 100);
  db.settings.description = String(req.body.description || "").slice(0, 500);
  writeDB(db); res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: "Hãy nhập câu hỏi." });
  if (!process.env.AI_API_KEY) return res.json({ reply: "Chatbot AI chưa được kết nối. Chủ cửa hàng cần thêm AI_API_KEY trong phần cấu hình hosting. Bạn vẫn có thể xem sản phẩm hoặc gửi đơn hàng trên website." });
  try {
    const products = db.products.filter(p => p.active).map(p => `${p.name} | Giá: ${p.price} | Tồn kho: ${p.stock} | Danh mục: ${p.category} | Mô tả: ${p.description}`).join("\n");
    const messages = [
      { role: "system", content: `Bạn là nhân viên tư vấn của ${db.settings.storeName}. Trả lời bằng ngôn ngữ khách đang dùng (tiếng Việt hoặc tiếng Anh). Chỉ dùng thông tin sản phẩm sau, không tự bịa giá/tồn kho/chính sách. Nếu thiếu thông tin, nói rõ chưa có dữ liệu và đề nghị liên hệ cửa hàng.\nThông tin cửa hàng: ${db.settings.description}\nSản phẩm:\n${products || "Chưa có sản phẩm."}` },
      ...history.slice(-8).filter(m => ["user", "assistant"].includes(m.role)).map(m => ({ role: m.role, content: String(m.content).slice(0, 1500) })),
      { role: "user", content: String(message).slice(0, 2000) }
    ];
    const response = await fetch(`${(process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: process.env.AI_MODEL || "gpt-4o-mini", messages, temperature: 0.3 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "AI provider error");
    res.json({ reply: data.choices?.[0]?.message?.content || "Mình chưa có câu trả lời lúc này." });
  } catch (e) { res.status(502).json({ error: "Chatbot đang gặp lỗi kết nối. Vui lòng thử lại sau." }); }
});

app.get("/admin", (_, res) => res.sendFile(path.join(ROOT, "public", "admin.html")));
app.get("*", (_, res) => res.sendFile(path.join(ROOT, "public", "index.html")));
app.listen(PORT, () => console.log(`Store running on http://localhost:${PORT}`));
