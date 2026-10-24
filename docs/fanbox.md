# FANBOX 漫画源 · VeneraX

实验版 0.1.1。用于阅读自己的 pixiv FANBOX 账号有权限访问的图片。一篇帖子对应一本漫画，文章或相册中的图片组成“正文图片”章节，公开封面单独显示。

## 安装

VeneraX 首页 → **漫画源 → 使用配置文件** → 导入 **fanbox.js**。不要导入 ZIP 包或测试文件。它与此前的 Fantia 扩展使用不同的源 ID，可以同时安装。

## 手机优先：App 内网页登录

1. 展开 **FANBOX（个人订阅）→ 登录 → 使用网页登录**（实际按钮文字可能因 App 语言不同而变化）。
2. 在 App 打开的网页里，用自己的 pixiv 账号登录 FANBOX，完成网站要求的验证。
3. 返回 FANBOX 首页后，扩展会尝试让 App 接收登录会话并关闭网页。
4. 在该源设置中点 **检查登录状态 → 检查**。显示“FANBOX 登录有效”后，再同步作者或打开动态。

不需要将账号密码或 Cookie 发给任何人。网页登录数据由 VeneraX 的 WebView 管理。

**网页登录为实验性入口，尚未在真实手机和私人账号上完成试登。** VeneraX 的扩展接口只能依据导航地址判断网页登录已返回，不能在关闭窗口前等待 API 验证，因此第 4 步用于真正验证会话。仅看到 App 显示“已登录”，不代表 API 已验证成功。

若网页登录不自动关闭、pixiv 无法登录，或网站验证持续失败，可尝试更新 VeneraX / 系统 WebView 并检查网络。不要在外部 Chrome 中登录后就期待会话自动进入 App；外部浏览器和 App WebView 的 Cookie 存储不同。若仍不兼容，使用下面的 Cookie 登录方式。

## 备用：Cookie 登录

在源的登录页填写 **FANBOXSESSID** 的值，再点登录。只填值，不带 `FANBOXSESSID=`、引号或整段 Cookie。

获取位置：电脑浏览器登录 https://www.fanbox.cc → F12 → **Application / 应用 → Cookies → https://www.fanbox.cc** → 复制 `FANBOXSESSID` 的 Value。手机 Chrome 没有直接查看此值的界面；可以优先尝试上面的 App 内网页登录。

该值是登录凭证，不要放进聊天、截图、仓库或脚本中。脚本只使用 VeneraX 的 Cookie 存储，不把凭证写入扩展源数据；App 备份是否包含 Cookie 取决于 VeneraX 本身。验证失败时会恢复原 Cookie。

切换账号前先在该源中注销；网页登录若仍自动进入旧账号，需要在 WebView 网页中退出旧的 pixiv / FANBOX 账号后再登录。源的注销操作清理扩展网络请求使用的 Cookie，网页浏览器自己的登录状态由 App / 网站管理。

## 浏览与阅读

- **探索 → FANBOX · 我的动态**：关注和支援作者的最新帖子。
- **探索 → FANBOX · 支援动态**：支援作者的最新帖子。
- 源设置 → **同步关注／支援作者 → 同步**，随后重新进入 **分类 → FANBOX · 我的作者**。分类列出支援作者和其他关注作者，点击后查看其帖子。
- 搜索时选择 FANBOX 源，输入作者／帖子链接或 ID：
  - `https://example.fanbox.cc/posts/1234567`
  - `https://www.fanbox.cc/@example/posts/1234567`
  - `1234567`（帖子 ID）
  - `https://example.fanbox.cc/`
  - `https://www.fanbox.cc/@example`
  - `@example` 或 `creator:example`（作者 ID，非显示名称）
- 不支持作品标题等关键词搜索。上面地址中的 `example` 和数字仅作格式示例。
- 帖子可收藏到 App 的**本地收藏**。本扩展只发送读取请求，不修改网站的关注、支援、点赞或收藏。
- 作者子域名帖子链接可粘贴到搜索中；App 的“打开链接”是否识别所有作者子域名，取决于其域名匹配方式。

## 支持与限制

- 支持图片帖子、文章图片及单张图片附件；文章图片依据正文块顺序排列，不依据图片 ID 或映射表顺序排列。
- 正文为 `null` 或 `isRestricted: true` 时不创建正文图片章节。所需支援金额仅作提示，不用于推断访问权限。
- ZIP、PDF、视频、音频和外部网盘附件请打开帖子原网页查看。本版不解包、不转换附件。
- 公开封面独立为“公开封面／预览”章节，不能当作完整正文。
- 每次打开正文重新获取帖子详情，检查权限并刷新图片签名。App 已下载内容由其本地功能管理。
- 图片只接受 FANBOX 下载域名及已知 pixiv 图片域名，外部图片链接会被忽略。FANBOX 会话不作为请求头发送到 pximg 图片服务器。
- 网站接口、结构或反自动化验证可能变化。仅有会话 Cookie 不保证每种网络环境都能通过验证。

## 排错

- **检查登录状态失败 / 400 / 401**：重新登录；填写的应是 FANBOX 的 `FANBOXSESSID`，不是 Fantia 的 `_session_id`，也不是 pixiv 的 `PHPSESSID`。
- **403 或返回网页而非 API 数据**：在网页检查验证、登录和网络；外部浏览器已有的验证状态可能无法直接复用于 App。
- **只有封面**：到原网页确认支援方案和权限，或查看帖子是否主要提供 ZIP、PDF、视频、文字等。
- **图片过期**：退出章节后重新进入，重新获取签名地址。
- **作者列表没更新**：点击同步，再重新进入分类页。同步接口发生错误时保留上一份缓存，避免误清空列表。
- **更新扩展**：本版已配置仓库内脚本直链，可用源的更新功能；根目录 `index.json` 同步记录版本。更新前保留数据，不要为更新而直接删除源。

## 测试

已核对 VeneraX 的账号、分类、搜索、游标探索、章节和图片回调接口，并用其实际 `assets/init.js` 包装器运行自动测试。测试的底层 App 桥接为模拟实现；未在完整 VeneraX 客户端安装试读，未实测私人账号、付费帖子或手机网页登录。

开发环境实际访问了 FANBOX 官方公开作者的帖子 API、作者分页 API，并验证公开图片正文的解析。没有使用私人登录凭证。

开发测试（安装使用扩展不需要这些命令）：

```sh
npm ci
npm test
```

可设置 `VENERA_INIT=/绝对路径/init.js`，用从 VeneraX 获取的 API 包装器运行测试；可设置 `FANBOX_PUBLIC_POST=/绝对路径/post.json`，对本地保存的公开帖子 API 响应额外做兼容检查。默认测试只使用合成数据，不联网。

接口交叉核对来源（实现独立编写）：

- VeneraX 源解析器：https://github.com/Kyosee/VeneraX/blob/master/lib/foundation/comic_source/parser.dart
- VeneraX 登录实现：https://github.com/Kyosee/VeneraX/blob/master/lib/pages/comic_source_page.dart
- FANBOX API、图片及分页结构：https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/fanbox.py
- 会话校验端点及新旧响应封装：https://github.com/ryoctrl/fc-downloader/blob/main/src/main/services/fanbox/index.ts
- WebView 登录起点：https://github.com/250king/MyFanbox/blob/master/lib/activity/login.dart
