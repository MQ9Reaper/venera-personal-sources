# Fantia 漫画源 · VeneraX

实验版 0.1.1。将自己的 Fantia 账号中可读取的图片展示为漫画；每个帖子是一本漫画，每个图片组是一个章节。无需编译或修改 VeneraX。

## 安装和登录

1. 保存仓库根目录中的 **fantia.js**。不要导入 ZIP 包、README 或测试脚本。
2. VeneraX 首页 → **漫画源** → **使用配置文件** → 选择 `fantia.js`。
3. 展开 **Fantia（个人订阅）** → **登录**，填写 `_session_id` 的值，点击登录。

这是 Cookie 登录，不需要输入 Fantia 邮箱或密码。本版没有内置网页登录功能。

### 获取 `_session_id`

建议在电脑浏览器操作，取得值后可以填到手机上的 VeneraX：

1. 浏览器打开 https://fantia.jp ，登录自己的账号，确认目标帖子能正常打开。
2. 按 F12 打开开发者工具。
3. Chrome / Edge：**Application（应用）→ Storage → Cookies → https://fantia.jp**。Firefox：**存储 → Cookie → https://fantia.jp**。
4. 找到名为 `_session_id` 的一行，复制 **Value（值）**。
5. 只将这个值填入扩展，不带 `_session_id=`，不带引号，也不填写整段 Cookie。

`_session_id` 等同登录凭证，只填到你自己的 App 中，不要发到聊天、截图或提交到仓库。脚本不把它写入源脚本或源数据，而是交给 VeneraX 的 Fantia Cookie 存储管理；是否进入应用备份取决于 App 本身。

## 阅读

- **探索 → Fantia · 我的动态**：查看账号关注作者的帖子，支持翻页。
- **漫画源 → Fantia → 同步我的关注作者 → 同步**：获取关注作者 ID。重新进入 **分类 → Fantia · 关注作者** 后点击作者查看帖子。初次显示“作者 #ID”；打开作者后会缓存名字，重新进入分类页显示名称。这里包括免费关注和付费订阅，不是仅付费名单。
- **搜索**：选择 Fantia 源，输入以下任意一种：
  - 帖子链接：`https://fantia.jp/posts/1234567`
  - 帖子 ID：`1234567`
  - 作者链接：`https://fantia.jp/fanclubs/1234`
  - 作者 ID 写法：`fanclub:1234`
- 不支持作者名、漫画名等关键词搜索；优先使用链接或“关注作者”。
- 帖子可收藏到 VeneraX 的**本地收藏**。本扩展不修改 Fantia 网站的关注、收藏或订阅状态。

## 支持范围

- 图片相册、博客中嵌入的 Fantia 图片、单张图片附件。
- 公开封面作为单独的“公开封面／预览”章节；它不代表完整付费内容。
- 仅当 API 明确标记 `visible_status: visible` 才创建正文图片章节。未开放的内容会在简介中说明，不尝试读取或推算图片地址。
- ZIP、PDF、视频、外部网盘、纯文字请使用帖子详情的原网页入口；本版不解包、不转换附件。
- 每次打开章节重新请求帖子数据，刷新图片签名并检查权限。已下载内容由 App 自行管理。

## 常见问题

- **登录失败**：重新从已登录浏览器复制 Cookie 的完整值；扩展会访问 `/api/v1/me` 验证。验证失败会恢复原 Cookie。登录成功后旧账号的关注列表缓存会清空，需重新同步。
- **401**：会话过期，在漫画源里重新登录。
- **403 / 返回网页而非 API 数据**：先在浏览器检查网页验证、年龄确认和访问权限；确认 App 的网络/代理能访问 Fantia。部分网站验证状态可能无法只靠 `_session_id` 转移，本版对此不保证兼容。
- **只有封面**：可能没有当前账号可读的图片，也可能是 ZIP、PDF、视频或文字帖子。到原网页确认具体内容与订阅/补购状态。
- **图片过期或加载失败**：退出章节后重新打开，重新取得签名地址。旧月份内容是否能读以 Fantia 的账号权限为准。
- **作者列表为空**：检查作者链接；若网页有帖子但 App 无内容，请提供不含 Cookie 的错误文字、App 版本和公开帖子链接以便排查。
- **更新**：本版已配置仓库内脚本直链，可使用源的更新功能；版本变化也会写入根目录 `index.json`。替换旧版前先备份阅读数据，不要为更新而直接卸载源。

## 验证与限制

已按 VeneraX 的源解析器核对类名、账号字段、搜索/探索返回值、分类跳转、章节和图片回调。自动测试覆盖 Cookie 校验及失败恢复、权限撤销、签名 URL、图片顺序、作者翻页、错误提示和关注列表。

开发时已访问 Fantia 的公开作者页及公开帖子 API，并用获取的页面验证解析。没有私人账号的登录或付费帖子实测，也没有在完整 VeneraX 客户端中做安装试读；此版本需要导入后验证。Fantia 的非公开 API 和页面结构可能变化。

开发测试（安装 App 使用时不需要）：

```sh
npm ci
npm test
```

默认用模拟的 Venera API 桥接测试。可将当前 VeneraX `assets/init.js` 下载到本机，然后运行 `VENERA_INIT=/绝对路径/init.js npm test`，改用真实 JS API 包装器；底层 App 桥接仍为模拟实现。`FANTIA_PUBLIC_HTML` 和 `FANTIA_PUBLIC_POST` 可选指向本地保存的公开作者 HTML 与帖子 JSON，启用额外两个数据兼容性测试。

接口依据：

- VeneraX 源解析器：https://github.com/Kyosee/VeneraX/blob/master/lib/foundation/comic_source/parser.dart
- VeneraX JavaScript API：https://github.com/Kyosee/VeneraX/blob/master/doc/js_api.md
- Fantia 登录、动态及关注端点参考：https://github.com/bitbybyte/fantiadl/blob/master/fantiadl/models.py
- 图片权限与博客结构交叉参考：https://github.com/danbooru/danbooru/blob/master/app/logical/source/extractor/fantia.rb
- 测试数据 `tests/post-photo.json` 为独立编写的合成测试数据，不包含真实账号、会话或付费内容。
