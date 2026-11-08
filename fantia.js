// Fantia for Venera / VeneraX — experimental, manually installed source.
// Credentials stay in the app's Fantia cookie jar.
class Fantia extends ComicSource {
    name = "Fantia（个人订阅）";
    key = "fantia_personal";
    version = "0.1.2";
    minAppVersion = "1.6.0";
    url = "https://raw.githubusercontent.com/MQ9Reaper/venera-personal-sources/main/fantia.js";
    _csrf = null;

    // Avoid browser-only APIs (URL, DOMParser, fetch) in the QuickJS runtime.
    absolute(value) {
        if (typeof value !== "string" || !value.trim()) return "";
        let s = value.trim();
        if (s.startsWith("//")) s = "https:" + s;
        if (s.startsWith("/") && !s.startsWith("//")) s = "https://fantia.jp" + s;
        return /^https:\/\/(?:[a-z0-9-]+\.)*fantia\.jp(?:\/|$)/i.test(s) ? s : "";
    }

    postId(value) {
        const s = String(value || "").trim();
        if (/^[1-9]\d*$/.test(s)) return s;
        const m = s.match(/^https:\/\/fantia\.jp\/posts\/([1-9]\d*)(?:[/?#]|$)/i);
        return m ? m[1] : null;
    }

    fanclubId(value) {
        const s = String(value || "").trim();
        const m = s.match(/^(?:fanclub:|https:\/\/fantia\.jp\/fanclubs\/)([1-9]\d*)(?:[/?#]|$)/i);
        return m ? m[1] : null;
    }

    image(value) {
        if (typeof value === "string") return this.absolute(value);
        if (!value || typeof value !== "object") return "";
        return this.image(value.original || value.large || value.main || value.medium || value.url);
    }

    async request(path, json, referer) {
        if (!path.startsWith("/") || path.startsWith("//")) throw new Error("无效的 Fantia 请求地址");
        const headers = { Referer: referer || "https://fantia.jp/" };
        if (json) {
            headers.Accept = "application/json";
            headers["X-Requested-With"] = "XMLHttpRequest";
            if (this._csrf) headers["X-CSRF-Token"] = this._csrf;
        }
        let res;
        try {
            res = await Network.get("https://fantia.jp" + path, headers);
        } catch (_) {
            throw new Error("连接 Fantia 失败，请检查网络或代理后重试");
        }
        if (res.status === 401) throw new Error("Fantia 登录已过期，请在漫画源中重新填写 _session_id");
        if (res.status === 403) throw new Error("Fantia 拒绝访问：请检查登录状态、网页验证及账号的订阅权限");
        if (res.status === 404) throw new Error("该 Fantia 作者或帖子不存在，或当前账号无法访问");
        if (res.status === 429) throw new Error("Fantia 请求过于频繁，请稍后重试");
        if (res.status < 200 || res.status >= 300) throw new Error("Fantia HTTP " + res.status);
        if (typeof res.body !== "string") throw new Error("Fantia 返回了无法识别的数据");
        if (!json) return res.body;
        let data;
        try { data = JSON.parse(res.body); }
        catch (_) { throw new Error("Fantia 返回网页而非 API 数据，请先在浏览器确认登录和网页验证正常"); }
        if (!data || typeof data !== "object" || data.error || data.errors) {
            throw new Error("Fantia API 返回错误，请在浏览器检查账号状态");
        }
        return data;
    }

    rememberCsrf(html) {
        const doc = new HtmlDocument(html);
        try {
            const el = doc.querySelector('meta[name="csrf-token"]');
            this._csrf = el ? el.attributes.content || null : null;
        } finally { doc.dispose(); }
    }

    async prepare(path) {
        const html = await this.request(path || "/", false);
        this.rememberCsrf(html);
        return html;
    }

    async me() {
        await this.prepare("/");
        const data = await this.request("/api/v1/me", true);
        // The endpoint is authenticated; a successful nonempty JSON response
        // is used across Fantia clients without depending on a user schema.
        if (!Object.keys(data).length || data.user === null || data.current_user === null || data.logged_in === false) {
            throw new Error("Fantia 会话无效，请重新复制已登录浏览器中的 _session_id");
        }
        return data;
    }

    account = {
        loginWithCookies: {
            fields: ["_session_id"],
            validate: async (values) => {
                const value = String(values[0] || "").trim();
                if (!value || /[\s;\r\n]/.test(value)) return false;
                if (value.startsWith("_session_id=")) {
                    UI.showMessage("只填写 _session_id 的值，不要带名称或整段 Cookie");
                    return false;
                }
                const previous = await Network.getCookies("https://fantia.jp/");
                this._csrf = null;
                Network.setCookies("https://fantia.jp/", [
                    new Cookie({ name: "_session_id", value: value, domain: "fantia.jp" })
                ]);
                try {
                    await this.me();
                    // Cached account-specific author IDs must not cross accounts.
                    this.deleteData("followedFanclubs");
                    this.deleteData("fanclubNames");
                    return true;
                } catch (e) {
                    Network.deleteCookies("https://fantia.jp/");
                    Network.setCookies("https://fantia.jp/", previous || []);
                    this._csrf = null;
                    UI.showMessage(String(e.message || e));
                    return false;
                }
            }
        },
        logout: () => {
            Network.deleteCookies("https://fantia.jp/");
            this.deleteData("followedFanclubs");
            this.deleteData("fanclubNames");
            this._csrf = null;
        },
        registerWebsite: "https://fantia.jp/"
    };

    summary(post) {
        if (!post || !/^[1-9]\d*$/.test(String(post.id))) throw new Error("Fantia 帖子数据格式变化");
        const club = post.fanclub || {};
        return {
            id: String(post.id), title: String(post.title || ("帖子 #" + post.id)),
            cover: this.image(post.thumb) || this.image(post.thumb_micro) || this.image(club.icon),
            subtitle: String(club.creator_name || club.fanclub_name || ""),
            tags: (post.tags || []).map(t => typeof t === "string" ? t : t.name).filter(Boolean)
        };
    }

    async timeline(page) {
        if (!this._csrf) await this.prepare("/");
        const data = await this.request("/api/v1/me/timelines/posts?page=" + page + "&per=24", true);
        if (!Array.isArray(data.posts) || typeof data.has_next !== "boolean") {
            throw new Error("Fantia 动态接口格式变化；可先在搜索中粘贴作者或帖子链接");
        }
        return { comics: data.posts.map(p => this.summary(p)), maxPage: data.has_next ? page + 1 : page };
    }

    async refreshFollowing() {
        await this.me();
        const data = await this.request("/api/v1/me/fanclubs", true);
        if (!Array.isArray(data.fanclub_ids)) throw new Error("Fantia 关注列表接口格式变化");
        const ids = Array.from(new Set(data.fanclub_ids.map(String).filter(id => /^[1-9]\d*$/.test(id))));
        this.saveData("followedFanclubs", ids);
        UI.showMessage("已同步 " + ids.length + " 位作者，请重新打开 Fantia 分类页");
    }

    explore = [{
        title: "Fantia · 我的动态", type: "multiPageComicList",
        load: async (page) => this.timeline(page || 1)
    }];

    // Dynamic category loaders are synchronous in VeneraX. Sync the IDs with
    // the settings button, then build categories from local data only.
    category = {
        title: "Fantia · 关注作者", enableRankingPage: false,
        parts: [{
            name: "关注作者（先在源设置中同步）", type: "dynamic",
            loader: () => {
                const names = this.loadData("fanclubNames") || {};
                return (this.loadData("followedFanclubs") || []).map(id => ({
                    label: names[id] || ("作者 #" + id),
                    target: { page: "search", attributes: { text: "fanclub:" + id } }
                }));
            }
        }]
    };

    settings = {
        syncFollowing: {
            title: "同步我的关注作者", type: "callback", buttonText: "同步",
            callback: async () => {
                try { await this.refreshFollowing(); }
                catch (e) { UI.showMessage(String(e.message || e)); }
            }
        },
        website: {
            title: "在浏览器打开 Fantia", type: "callback", buttonText: "打开",
            callback: () => UI.launchUrl("https://fantia.jp/")
        }
    };

    async fanclubPosts(id, page) {
        const html = await this.prepare("/fanclubs/" + id + "/posts?page=" + page);
        const doc = new HtmlDocument(html);
        try {
            const comics = [], seen = new Set();
            for (const el of doc.querySelectorAll(".post")) {
                const a = el.querySelector('a.link-block[href*="/posts/"]') || el.querySelector('a[href*="/posts/"]');
                if (!a) continue;
                const pid = this.postId(this.absolute(a.attributes.href));
                if (!pid || seen.has(pid)) continue;
                seen.add(pid);
                const img = el.querySelector(".post-thumbnail img[data-src]") || el.querySelector(".post-thumbnail img");
                const title = el.querySelector(".post-title");
                comics.push({
                    id: pid, title: String(a.attributes.title || (title && title.text) || ("帖子 #" + pid)).trim(),
                    cover: img ? this.image(img.attributes["data-src"] || img.attributes.src) : "",
                    subtitle: "Fantia · 作者 #" + id
                });
            }
            const name = doc.querySelector(".fanclub-name");
            if (name && name.text.trim()) {
                const names = this.loadData("fanclubNames") || {};
                names[id] = name.text.trim(); this.saveData("fanclubNames", names);
            }
            if (!comics.length && !name) {
                if (doc.querySelector('form[action*="/sessions"]') || /\/sessions\/signin|年齢確認|年齢認証/.test(html)) {
                    throw new Error("作者列表需要登录或年龄确认，请先在浏览器确认可访问，并更新会话 Cookie");
                }
                throw new Error("无法解析作者列表，请先在浏览器检查作者链接");
            }
            const next = doc.querySelector('a[rel="next"]') || doc.querySelector(".pagination .next a");
            return { comics: comics, maxPage: comics.length && next ? page + 1 : page };
        } finally { doc.dispose(); }
    }

    search = {
        load: async (keyword, options, page) => {
            page = page || 1;
            const club = this.fanclubId(keyword);
            if (club) return this.fanclubPosts(club, page);
            const id = this.postId(keyword);
            if (id) {
                if (page > 1) return { comics: [], maxPage: 1 };
                return { comics: [this.summary(await this.post(id))], maxPage: 1 };
            }
            throw new Error("请粘贴 Fantia 帖子链接、作者链接，或输入帖子 ID / fanclub:作者ID；暂不支持关键词搜索");
        }
    };

    async post(id) {
        if (!this.postId(id)) throw new Error("无效的 Fantia 帖子 ID");
        await this.prepare("/posts/" + id);
        const data = await this.request("/api/v1/posts/" + id, true, "https://fantia.jp/posts/" + id);
        if (!data.post || String(data.post.id) !== String(id) || !Array.isArray(data.post.post_contents)) {
            throw new Error("Fantia 帖子接口格式变化");
        }
        return data.post;
    }

    contentImages(content) {
        // Never infer access from price, plan names, or the existence of URLs.
        if (content.visible_status !== "visible") return [];
        const images = [];
        if (content.category === "photo_gallery") {
            for (const p of content.post_content_photos || []) {
                const url = this.image(p.url) || this.absolute(p.show_original_uri);
                if (url) images.push(url);
            }
        } else if (content.category === "blog") {
            let delta;
            try { delta = typeof content.comment === "string" ? JSON.parse(content.comment) : content.comment; }
            catch (_) { delta = null; }
            for (const op of (delta && delta.ops) || []) {
                const insert = op.insert;
                if (!insert || typeof insert !== "object") continue;
                const url = this.image(insert.fantiaImage && insert.fantiaImage.original_url) || this.image(insert.image);
                if (url) images.push(url);
            }
        } else if (content.category === "file" && /\.(?:jpe?g|png|gif|webp|avif)$/i.test(content.filename || "")) {
            const url = this.absolute(content.download_uri);
            if (url) images.push(url);
        }
        return Array.from(new Set(images));
    }


    // Prime treats any uppercase T (even "Thu"/"Tue") as an ISO marker.
    // Parse explicitly: QuickJS Date.parse support for RFC dates varies.
    normalizeTime(value) {
        if (typeof value !== "string" || !value.trim()) return null;
        const text = value.trim();
        let year, month, day, hour, minute, second, fraction = "", zone = "";
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i);
        if (iso) {
            year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
            hour = iso[4] === undefined ? null : Number(iso[4]);
            minute = Number(iso[5] || 0); second = Number(iso[6] || 0);
            fraction = (iso[7] || "").slice(0, 7); zone = iso[8] || "";
        } else {
            const rfc = text.match(/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(Z|UTC|GMT|[+-]\d{2}:?\d{2})$/i);
            if (!rfc) return null;
            const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
            year = Number(rfc[3]); month = months.indexOf(rfc[2].toLowerCase()) + 1; day = Number(rfc[1]);
            hour = Number(rfc[4]); minute = Number(rfc[5]); second = Number(rfc[6] || 0); zone = rfc[7];
        }
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
        if (hour !== null && (hour > 23 || minute > 59 || second > 59)) return null;
        if (/^(?:Z|UTC|GMT)$/i.test(zone)) zone = "Z";
        else if (zone) {
            const offset = zone.match(/^([+-])(\d{2}):?(\d{2})$/);
            if (!offset || Number(offset[2]) > 23 || Number(offset[3]) > 59) return null;
            zone = offset[1] + offset[2] + ":" + offset[3];
        }
        const pad = number => String(number).padStart(2, "0");
        const date = String(year).padStart(4, "0") + "-" + pad(month) + "-" + pad(day);
        return hour === null ? date : date + "T" + pad(hour) + ":" + pad(minute) + ":" + pad(second) + fraction + zone;
    }

    details(post) {
        const summary = this.summary(post), chapters = {}, notes = [];
        if (this.image(post.thumb) || this.image(post.thumb_micro)) chapters.cover = "公开封面／预览";
        for (const content of post.post_contents) {
            const label = String(content.title || ("内容 #" + content.id));
            if (content.visible_status !== "visible") {
                notes.push("[当前账号不可读] " + label); continue;
            }
            if (!/^[1-9]\d*$/.test(String(content.id))) continue;
            if (this.contentImages(content).length) chapters["content_" + content.id] = label;
            else notes.push("[文字或附件，请打开原网页] " + label);
        }
        const uploadTime = this.normalizeTime(post.posted_at);
        const updateTime = this.normalizeTime(post.converted_at) || uploadTime;
        let description = String(post.comment || "");
        if (notes.length) description += "\n\n" + notes.join("\n");
        if (!Object.keys(chapters).length) description += "\n\n该帖子没有当前账号可读取的图片，请打开原网页查看。";
        return {
            title: summary.title, subtitle: summary.subtitle, cover: summary.cover,
            description: description, chapters: chapters,
            tags: { "作者": summary.subtitle ? [summary.subtitle] : [], "标签": summary.tags },
            uploadTime: uploadTime, updateTime: updateTime,
            url: "https://fantia.jp/posts/" + post.id
        };
    }

    comic = {
        loadInfo: async (id) => this.details(await this.post(id)),
        loadEp: async (id, ep) => {
            // Fetch again so an expired signed URL or changed plan is not cached.
            const post = await this.post(id);
            let images;
            if (ep === "cover") {
                const cover = this.image(post.thumb) || this.image(post.thumb_micro); images = cover ? [cover] : [];
            } else {
                const match = String(ep || "").match(/^content_([1-9]\d*)$/);
                const content = match && post.post_contents.find(c => String(c.id) === match[1]);
                if (!content) throw new Error("章节已变更，请刷新帖子详情");
                if (content.visible_status !== "visible") throw new Error("当前账号无此内容的阅读权限，请在 Fantia 确认订阅或补购状态");
                images = this.contentImages(content);
            }
            if (!images.length) throw new Error("本章节没有可读取的图片；ZIP、PDF、视频及纯文字请打开原网页查看");
            return { images: images };
        },
        onImageLoad: async (url, id) => {
            const safe = this.absolute(url);
            if (!safe) throw new Error("图片地址不属于 Fantia");
            const headers = { Referer: "https://fantia.jp/posts/" + id };
            if (/^https:\/\/fantia\.jp\/posts\/\d+\/post_content_photo\/\d+(?:[/?#]|$)/.test(safe)) {
                const path = safe.slice("https://fantia.jp".length);
                const html = await this.request(path, false, headers.Referer);
                const doc = new HtmlDocument(html);
                try {
                    const img = doc.querySelector('img[src*="/uploads/"]');
                    const original = img && this.absolute(img.attributes.src);
                    if (!original) throw new Error("无法获取原图，请在网页确认权限后刷新章节");
                    return { url: original, headers: headers };
                } finally { doc.dispose(); }
            }
            return { url: safe, headers: headers };
        },
        link: {
            domains: ["fantia.jp"],
            linkToId: (link) => this.postId(link)
        },
        idMatch: "^[1-9][0-9]*$"
    };
}
