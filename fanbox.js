// pixiv FANBOX for VeneraX. Experimental personal-account source.
// Credentials use the app cookie jar; updates are published in the source repository.
class Fanbox extends ComicSource {
    name = "FANBOX（个人订阅）";
    key = "fanbox_personal";
    version = "0.1.1";
    minAppVersion = "1.6.0";
    url = "https://raw.githubusercontent.com/MQ9Reaper/venera-personal-sources/main/fanbox.js";
    _webLoginArmed = false;
    _creatorPages = new Map();

    validCreator(id) {
        return typeof id === "string" && /^[a-z0-9_-]{1,128}$/i.test(id)
            && !/^(?:www|api|downloads)$/i.test(id);
    }

    parseInput(value) {
        const s = String(value || "").trim();
        if (/^[1-9]\d*$/.test(s)) return { postId: s };
        let m = s.match(/^(?:creator:|@)([a-z0-9_-]+)$/i);
        if (m && this.validCreator(m[1])) return { creatorId: m[1] };
        m = s.match(/^https:\/\/(?:www\.)?fanbox\.cc\/@([a-z0-9_-]+)(?:\/posts(?:\/([1-9]\d*))?)?\/?(?:[?#][^\s]*)?$/i)
            || s.match(/^https:\/\/([a-z0-9_-]+)\.fanbox\.cc(?:\/posts(?:\/([1-9]\d*))?)?\/?(?:[?#][^\s]*)?$/i);
        if (m && this.validCreator(m[1])) return m[2] ? { postId: m[2] } : { creatorId: m[1] };
        return null;
    }

    webPost(post) {
        return "https://www.fanbox.cc/@" + (this.validCreator(post.creatorId) ? post.creatorId : "official") + "/posts/" + post.id;
    }

    apiUrl(value, expected) {
        let s = String(value || "");
        if (s.startsWith("//api.fanbox.cc/")) s = "https:" + s;
        if (s.startsWith("/") && !s.startsWith("//")) s = "https://api.fanbox.cc" + s;
        const m = s.match(/^https:\/\/api\.fanbox\.cc\/(user\.countUnreadMessages|creator\.listFollowing|plan\.listSupporting|post\.listHome|post\.listSupporting|post\.paginateCreator|post\.listCreator|post\.info)(?:\?[^\s#]*)?$/);
        if (!m || (expected && m[1] !== expected)) throw new Error("FANBOX 返回了不受支持的 API 或翻页地址");
        return s;
    }

    mediaUrl(value) {
        if (typeof value !== "string") return "";
        // Keep signed query strings unchanged. Never forward FANBOX cookies to pximg.
        return /^https:\/\/(?:downloads\.fanbox\.cc|(?:[a-z0-9-]+\.)*pximg\.net|fanbox\.pixiv\.net)\//i.test(value) ? value : "";
    }

    async syncSessionDomains() {
        // Desktop WebView implementations may import host-only www cookies.
        // Keep an existing API session, including server-rotated cookies.
        const apiCookies = await Network.getCookies("https://api.fanbox.cc/");
        if ((apiCookies || []).some(c => c.name === "FANBOXSESSID" && c.value)) return;
        const cookies = await Network.getCookies("https://www.fanbox.cc/");
        const session = (cookies || []).find(c => c.name === "FANBOXSESSID" && c.value);
        if (session) Network.setCookies("https://api.fanbox.cc/", [
            new Cookie({ name: "FANBOXSESSID", value: session.value, domain: ".fanbox.cc" })
        ]);
    }

    async api(path, expected) {
        const url = this.apiUrl(path, expected);
        await this.syncSessionDomains();
        let res;
        try {
            res = await Network.get(url, {
                Accept: "application/json, text/plain, */*",
                Origin: "https://www.fanbox.cc", Referer: "https://www.fanbox.cc/"
            });
        } catch (_) { throw new Error("连接 FANBOX 失败，请检查网络或代理后重试"); }
        if (res.status === 401 || (res.status === 400 && url.includes("/user.countUnreadMessages"))) {
            throw new Error("FANBOX 会话无效或已过期，请重新网页登录或填写 FANBOXSESSID");
        }
        if (res.status === 403) throw new Error("FANBOX 拒绝访问，请检查网页验证、网络与账号权限");
        if (res.status === 404) throw new Error("FANBOX 作者或帖子不存在，或当前账号无法访问");
        if (res.status === 429) throw new Error("FANBOX 请求过于频繁，请稍后重试");
        if (res.status < 200 || res.status >= 300) throw new Error("FANBOX HTTP " + res.status);
        let data;
        try { data = JSON.parse(res.body); }
        catch (_) { throw new Error("FANBOX 返回网页而非 API 数据，请在浏览器检查网站验证"); }
        if (!data || typeof data !== "object" || data.error || !Object.prototype.hasOwnProperty.call(data, "body")) {
            throw new Error("FANBOX API 返回错误或格式变化，请检查登录状态后重试");
        }
        return data.body;
    }

    async checkAuth() {
        const count = await this.api("/user.countUnreadMessages");
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
            throw new Error("无法确认 FANBOX 登录状态，验证接口格式可能已变化");
        }
    }

    clearAccountCache() {
        this._creatorPages = new Map();
        this.deleteData("creators");
    }

    account = {
        loginWithWebview: {
            url: "https://www.fanbox.cc/auth/start",
            checkStatus: (url) => {
                // Never accept a bare homepage as evidence of a login. Arm
                // only after starting the auth flow, then capture its return.
                if (/^https:\/\/www\.fanbox\.cc\/auth\//.test(url)
                    || /^https:\/\/accounts\.pixiv\.net\/(?:login|signup)(?:[/?#]|$)/.test(url)) {
                    this._webLoginArmed = true; return false;
                }
                return this._webLoginArmed && /^https:\/\/www\.fanbox\.cc\/(?:[?#][^\s]*)?$/.test(url);
            },
            onLoginSuccess: () => {
                this._webLoginArmed = false;
                this.clearAccountCache();
                // VeneraX's WebView hook is synchronous and cannot await an
                // authenticated API check. Do not claim API validation here.
                UI.showMessage("网页登录已返回，请点源设置中的「检查登录状态」确认会话");
            }
        },
        loginWithCookies: {
            fields: ["FANBOXSESSID"],
            validate: async (values) => {
                const value = String(values[0] || "").trim();
                if (!value || /[\s;]/.test(value) || value.startsWith("FANBOXSESSID=")) {
                    UI.showMessage("只填写 FANBOXSESSID 的值，不带名称或整段 Cookie"); return false;
                }
                const hosts = ["www.fanbox.cc", "api.fanbox.cc", "downloads.fanbox.cc"];
                const old = [];
                for (const host of hosts) old.push(await Network.getCookies("https://" + host + "/") || []);
                // Remove old host-only sessions before adding the candidate,
                // otherwise requests may accidentally validate the old user.
                for (const host of hosts) Network.deleteCookies("https://" + host + "/");
                for (let i = 0; i < hosts.length; i++) Network.setCookies("https://" + hosts[i] + "/", old[i].filter(c => c.name !== "FANBOXSESSID"));
                Network.setCookies("https://www.fanbox.cc/", [
                    new Cookie({ name: "FANBOXSESSID", value: value, domain: ".fanbox.cc" })
                ]);
                try {
                    await this.checkAuth(); this.clearAccountCache(); return true;
                } catch (e) {
                    for (const host of hosts) Network.deleteCookies("https://" + host + "/");
                    for (let i = 0; i < hosts.length; i++) Network.setCookies("https://" + hosts[i] + "/", old[i]);
                    UI.showMessage(String(e.message || e)); return false;
                }
            }
        },
        logout: () => {
            for (const host of ["www.fanbox.cc", "api.fanbox.cc", "downloads.fanbox.cc"]) Network.deleteCookies("https://" + host + "/");
            this._webLoginArmed = false;
            this.clearAccountCache();
        },
        registerWebsite: "https://www.fanbox.cc/"
    };

    summary(post) {
        if (!post || !/^[1-9]\d*$/.test(String(post.id))) throw new Error("FANBOX 帖子列表格式变化");
        return {
            id: String(post.id), title: String(post.title || ("帖子 #" + post.id)),
            subtitle: String((post.user && post.user.name) || post.creatorId || ""),
            cover: this.mediaUrl(post.coverImageUrl) || this.mediaUrl(post.cover && post.cover.url),
            tags: (Array.isArray(post.tags) ? post.tags : []).filter(t => typeof t === "string")
        };
    }

    async feed(kind, next) {
        const endpoint = kind === "supporting" ? "post.listSupporting" : "post.listHome";
        const url = next ? this.apiUrl(next, endpoint) : "/" + endpoint + "?limit=20";
        const body = await this.api(url, endpoint);
        if (!body || !Array.isArray(body.items)) throw new Error("FANBOX 动态接口格式变化");
        const cursor = body.nextUrl == null ? null : this.apiUrl(body.nextUrl, endpoint);
        if (cursor && cursor === this.apiUrl(url)) throw new Error("FANBOX 返回了重复的翻页地址，请刷新列表");
        return { comics: body.items.map(p => this.summary(p)), next: cursor };
    }

    explore = [
        { title: "FANBOX · 我的动态", type: "multiPageComicList", loadNext: async (next) => this.feed("home", next) },
        { title: "FANBOX · 支援动态", type: "multiPageComicList", loadNext: async (next) => this.feed("supporting", next) }
    ];

    creatorArray(body, key) {
        if (Array.isArray(body)) return body;
        if (body && Array.isArray(body[key])) return body[key];
        throw new Error("FANBOX 作者列表接口格式变化");
    }

    async syncCreators() {
        await this.checkAuth();
        // Only replace the cache after both requests succeed, so a transient
        // failure does not silently erase supported or followed creators.
        const following = this.creatorArray(await this.api("/creator.listFollowing"), "creators");
        const supporting = this.creatorArray(await this.api("/plan.listSupporting"), "plans");
        const creators = new Map();
        for (const [items, support] of [[following, false], [supporting, true]]) {
            for (const c of items) {
                if (!c || !this.validCreator(c.creatorId)) continue;
                const previous = creators.get(c.creatorId);
                creators.set(c.creatorId, {
                    id: c.creatorId,
                    name: String((c.user && c.user.name) || (previous && previous.name) || c.creatorId),
                    supporting: support || !!(previous && previous.supporting) || c.isSupported === true || c.isStopped === true
                });
            }
        }
        this.saveData("creators", Array.from(creators.values()));
        UI.showMessage("已同步 " + creators.size + " 位作者，请重新进入 FANBOX 分类页");
    }

    categories(supporting) {
        return (this.loadData("creators") || []).filter(c => c.supporting === supporting).map(c => ({
            label: c.name,
            target: { page: "search", attributes: { text: "creator:" + c.id } }
        }));
    }

    category = {
        title: "FANBOX · 我的作者", enableRankingPage: false,
        parts: [
            { name: "支援作者（先在源设置同步）", type: "dynamic", loader: () => this.categories(true) },
            { name: "关注作者", type: "dynamic", loader: () => this.categories(false) }
        ]
    };

    settings = {
        checkLogin: {
            title: "检查登录状态", type: "callback", buttonText: "检查",
            callback: async () => {
                try { await this.checkAuth(); UI.showMessage("FANBOX 登录有效"); }
                catch (e) { UI.showMessage(String(e.message || e)); }
            }
        },
        syncCreators: {
            title: "同步关注／支援作者", type: "callback", buttonText: "同步",
            callback: async () => {
                try { await this.syncCreators(); }
                catch (e) { UI.showMessage(String(e.message || e)); }
            }
        },
        website: {
            title: "在浏览器打开 FANBOX", type: "callback", buttonText: "打开",
            callback: () => UI.launchUrl("https://www.fanbox.cc/")
        }
    };

    async creatorPosts(id, page) {
        if (!this.validCreator(id)) throw new Error("无效的 FANBOX 作者 ID");
        let cache = this._creatorPages.get(id);
        if (page === 1 || !cache || Date.now() - cache.time > 300000) {
            const body = await this.api("/post.paginateCreator?creatorId=" + encodeURIComponent(id));
            const urls = Array.isArray(body) ? body : body && body.pageUrls;
            if (!Array.isArray(urls)) throw new Error("FANBOX 作者分页接口格式变化");
            cache = { urls: urls.map(u => this.apiUrl(u, "post.listCreator")), time: Date.now() };
            this._creatorPages.set(id, cache);
        }
        const maxPage = Math.max(1, cache.urls.length);
        if (!cache.urls[page - 1]) return { comics: [], maxPage: maxPage };
        const body = await this.api(cache.urls[page - 1], "post.listCreator");
        const posts = Array.isArray(body) ? body : body && body.posts;
        if (!Array.isArray(posts)) throw new Error("FANBOX 作者帖子接口格式变化");
        return { comics: posts.map(p => this.summary(p)), maxPage: maxPage };
    }

    search = {
        load: async (keyword, options, page) => {
            const input = this.parseInput(keyword); page = page || 1;
            if (!input) throw new Error("请粘贴 FANBOX 作者／帖子链接，或输入帖子 ID、@作者ID、creator:作者ID；暂不支持标题关键词搜索");
            if (input.creatorId) return this.creatorPosts(input.creatorId, page);
            if (page > 1) return { comics: [], maxPage: 1 };
            return { comics: [this.summary(await this.post(input.postId))], maxPage: 1 };
        }
    };

    async post(id) {
        if (!/^[1-9]\d*$/.test(String(id))) throw new Error("无效的 FANBOX 帖子 ID");
        const body = await this.api("/post.info?postId=" + id);
        const post = body && body.post ? body.post : body;
        if (!post || String(post.id) !== String(id)) throw new Error("FANBOX 帖子不存在或接口格式变化");
        return post;
    }

    images(post) {
        if (post.isRestricted === true || !post.body || typeof post.body !== "object") return [];
        const body = post.body, images = [], seen = new Set();
        const add = url => {
            const safe = this.mediaUrl(url);
            if (safe && !seen.has(safe)) { seen.add(safe); images.push(safe); }
        };
        const addFile = file => {
            if (file && /^(?:jpe?g|png|gif|webp|avif)$/i.test(file.extension || "")) add(file.url);
        };
        if (post.type === "article") {
            // Maps are lookup tables, not reading order. Only referenced
            // images and image attachments become pages, in block order.
            for (const block of body.blocks || []) {
                if (block.type === "image" && body.imageMap && body.imageMap[block.imageId]) add(body.imageMap[block.imageId].originalUrl);
                if (block.type === "file" && body.fileMap) addFile(body.fileMap[block.fileId]);
            }
        } else {
            for (const image of body.images || []) add(image.originalUrl);
            for (const file of body.files || []) addFile(file);
        }
        if (typeof body.html === "string") {
            const doc = new HtmlDocument(body.html);
            try {
                for (const el of doc.querySelectorAll('a[href], img[data-src-original]')) {
                    const url = el.attributes["data-src-original"] || el.attributes.href;
                    if (/\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/i.test(url || "")) add(url);
                }
            } finally { doc.dispose(); }
        }
        return images;
    }

    details(post) {
        const summary = this.summary(post), chapters = {};
        if (this.mediaUrl(post.coverImageUrl)) chapters.cover = "公开封面／预览";
        if (this.images(post).length) chapters.body = "正文图片";
        const body = post.body || {};
        let description = String(post.excerpt || body.text || "");
        if (Array.isArray(body.blocks)) description += "\n" + body.blocks.filter(b => b.type === "p" && typeof b.text === "string").map(b => b.text).join("\n");
        if (post.isRestricted === true || !post.body) description += "\n\n当前账号无法读取正文，请在 FANBOX 确认登录、支援方案及访问权限。";
        else if (!chapters.body) description += "\n\n该帖子没有可读取的图片，可能是文字、ZIP、PDF、视频或外部附件，请打开原网页。";
        if (post.feeRequired) description += "\n所需支援金额：" + post.feeRequired + " 日元/月（以网站为准）";
        return {
            title: summary.title, subtitle: summary.subtitle, cover: summary.cover,
            description: description, chapters: chapters,
            tags: { "作者": summary.subtitle ? [summary.subtitle] : [], "标签": summary.tags },
            uploadTime: post.publishedDatetime || "", updateTime: post.updatedDatetime || post.publishedDatetime || "",
            url: this.webPost(post)
        };
    }

    comic = {
        loadInfo: async (id) => this.details(await this.post(id)),
        loadEp: async (id, ep) => {
            // Fetch fresh to recheck permissions and renew signed media URLs.
            const post = await this.post(id);
            if (ep === "cover") {
                const cover = this.mediaUrl(post.coverImageUrl);
                if (cover) return { images: [cover] };
            } else if (ep === "body") {
                if (post.isRestricted === true || !post.body) throw new Error("当前账号无法读取正文，请在 FANBOX 确认支援权限");
                const images = this.images(post);
                if (images.length) return { images: images };
            }
            throw new Error("该章节没有可读取的图片，请刷新帖子或打开原网页");
        },
        onImageLoad: async (url) => {
            const safe = this.mediaUrl(url);
            if (!safe) throw new Error("不支持此 FANBOX 图片地址");
            if (safe.startsWith("https://downloads.fanbox.cc/")) await this.syncSessionDomains();
            return { url: safe, headers: { Referer: "https://www.fanbox.cc/" } };
        },
        onThumbnailLoad: (url) => {
            const safe = this.mediaUrl(url);
            if (!safe) throw new Error("不支持此 FANBOX 封面地址");
            return { url: safe, headers: { Referer: "https://www.fanbox.cc/" } };
        },
        link: {
            domains: ["fanbox.cc", "www.fanbox.cc"],
            linkToId: (link) => { const p = this.parseInput(link); return p && p.postId ? p.postId : null; }
        },
        idMatch: "^[1-9][0-9]*$"
    };
}
