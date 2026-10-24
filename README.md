# Venera 个人订阅漫画源

使用自己的 Fantia / pixiv FANBOX 账号，在 Venera 系列 App 中阅读已有访问权限的图片内容。

| 漫画源 | 登录方式 | 详细说明 |
| --- | --- | --- |
| Fantia | `_session_id` Cookie | [Fantia 安装与使用](docs/fantia.md) |
| FANBOX | `FANBOXSESSID` Cookie；实验性 App 内网页登录 | [FANBOX 安装与使用](docs/fanbox.md) |

当前为 **0.1.1 实验版**。帖子作为漫画，图片相册或正文作为章节。ZIP、PDF、视频及外部网盘附件请打开原网页查看。

## 安装

### 用直链安装单个源

在 App 的 **漫画源 → 添加漫画源 / URL** 中填写对应地址：

**Fantia**

```text
https://raw.githubusercontent.com/MQ9Reaper/venera-personal-sources/main/fantia.js
```

**FANBOX**

```text
https://raw.githubusercontent.com/MQ9Reaper/venera-personal-sources/main/fanbox.js
```

也可下载仓库根目录的 `.js` 文件，在 **漫画源 → 使用配置文件** 中导入。不要将 GitHub 的 `blob/main/...` 网页地址填进脚本 URL 输入框。

### 添加来源库

支持自定义来源库 / 漫画源列表的版本，可添加这个列表地址，再从列表安装所需的源：

```text
https://raw.githubusercontent.com/MQ9Reaper/venera-personal-sources/main/index.json
```

VeneraX 入口为 **漫画源 → 来源库 → 添加库**；其他版本的菜单名称可能不同。若 GitHub 直链无法访问，请检查网络或下载文件后本地导入。

### 已安装聊天中提供的 0.1.0 版本

源 ID 保持不变：`fantia_personal`、`fanbox_personal`。已经安装时不要重复添加同 ID 源，也不要为更新而删除源。

先备份数据，再通过支持的来源库更新功能升级，或使用 App 的源编辑功能替换脚本内容。0.1.1 已补充各自的脚本更新地址；以后发布版本时，脚本与 `index.json` 将一起更新。

## 登录和阅读

- Fantia：在源登录页填写 `_session_id` 的**值**。
- FANBOX：填写 `FANBOXSESSID` 的**值**；手机可尝试源登录页的 **使用网页登录**，返回后点击源设置中的 **检查登录状态**。
- 不带 Cookie 名称、等号前缀、引号或整段 Cookie。两个网站的 Cookie 不能互换。
- 登录后在源设置中同步作者，再进入分类页浏览，或从探索页查看账号动态。
- 搜索支持作者／帖子链接和文档中列出的 ID 格式，暂不支持标题关键词搜索。

Cookie 等同登录凭证，只填入自己的 App，不要提交到仓库、Issue 或截图中。脚本不内置账号、Cookie、私人数据或付费内容，也不修改网站的支援与关注状态。

## 兼容性和验证范围

按官方仓库当前接口核对了原版 **Venera 1.6.3**、**Venera Prime 2.6.3** 和 VeneraX；脚本声明最低版本为 1.6.0。原版与 Prime 的 JavaScript API 包装器一致，脚本使用的账号、动态分类、翻页、章节和图片回调接口均存在。

已运行自动测试，并通过公开帖子和作者 API 验证部分数据解析。尚未在完整客户端中完成安装试读，也未实测私人账号、付费帖子或手机网页登录。接口兼容不等同于所有网站验证和网络环境都能通过。

FANBOX 的网页登录返回检测受 App 扩展接口限制，真正的登录状态以源设置中的 **检查登录状态** 结果为准。付费内容始终以网站对当前账号返回的访问权限为准。

## 开发测试

```sh
npm ci
npm test
```

默认测试不联网，使用模拟 App 桥接和合成数据。开发者可设置 `VENERA_INIT=/绝对路径/init.js`，用 Venera 的实际 `assets/init.js` 包装器运行同一套测试；底层 App 桥接仍为模拟实现。

可选环境变量 `FANTIA_PUBLIC_HTML`、`FANTIA_PUBLIC_POST`、`FANBOX_PUBLIC_POST` 指向本地保存的公开响应，启用额外的数据兼容性检查；不要提交这些原始响应、私人会话或下载内容。

## 问题反馈

请附 App 名称及版本、操作步骤和错误文字；如方便，可附公开的作者／帖子链接。不要发送账号密码、Cookie 或仅对私人账号可见的响应数据。
