class Vomic extends ComicSource {
    name = "Vomic漫画"
    key = "vomic"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://vomicmh.com"

    static SALT = "hhhasda"
    static INITIAL_HASH = -1640531527
    static categories = [
        [4, "冒险"], [5, "搞笑"], [6, "动作"], [7, "科幻"], [8, "爱情"],
        [9, "侦探"], [10, "竞技"], [11, "魔法"], [12, "校园"], [13, "百合"],
        [14, "耽美"], [15, "历史"], [16, "战争"], [17, "宅系"], [18, "治愈"],
        [20, "武侠"], [21, "职场"], [22, "神鬼"], [23, "奇幻"], [24, "生活"],
        [26, "热血"], [27, "古风"], [28, "悬疑"], [29, "都市"], [30, "架空"],
        [31, "青春"], [32, "剧情"], [34, "犯罪"], [35, "致郁"], [36, "纯爱"],
        [37, "恋爱"], [38, "体育"], [39, "末世"], [40, "少女"], [41, "重生"],
        [43, "美食"], [25, "其他"],
    ]

    static rotl(x, n) {
        return ((x << n) | (x >>> (32 - n))) | 0
    }

    static hash(data, timestamp) {
        const salt = Vomic.SALT
        const key = []
        for (let i = 0; i < salt.length; i++) key.push(salt.charCodeAt(i) & 0xff)
        let h = Vomic.INITIAL_HASH | 0
        for (const b of key) h = Vomic.rotl((h ^ b) | 0, 7)
        const buf = Convert.encodeUtf8(data + timestamp + salt)
        for (let i = 0; i < buf.length; i++) {
            const k = key[i % key.length]
            const mix = i % 2 === 0 ? k * 8 : k >> 1
            h = (Vomic.rotl((h ^ buf[i]) | 0, 5) ^ mix) | 0
        }
        for (const b of key) h = Vomic.rotl((h ^ ((b * 16) | 0)) | 0, 9)
        return (h >>> 0).toString(16).padStart(8, "0")
    }

    get apiBase() {
        let custom = ""
        try {
            custom = this.loadSetting("api_base") || ""
        } catch (e) {
            custom = ""
        }
        custom = (custom + "").trim()
        if (custom.length > 0) return custom.replace(/\/+$/, "")
        return "https://api.vomicmh.com/pics_new/pics"
    }

    get baseHeaders() {
        return {
            "user-agent": "Dart/3.13 (dart:io)",
            "platform": "android",
            "hide-content": "0",
            "name": "pics",
            "version": "1.2.1",
            "accept": "application/json",
        }
    }

    signParams(params) {
        const keys = Object.keys(params || {})
            .filter(k => params[k] !== undefined && params[k] !== null && `${params[k]}` !== "")
            .sort()
        const payload = keys.map(k => `${k}=${params[k]}`).join("&")
        const timestamp = `${Math.floor(Date.now() / 1000)}`
        const encoded = Convert.encodeBase64(Convert.encodeUtf8(payload + timestamp + Vomic.SALT))
        return { t: timestamp, s: Vomic.hash(encoded, timestamp) }
    }

    async request(path, params, token) {
        const keys = Object.keys(params || {})
            .filter(k => params[k] !== undefined && params[k] !== null && `${params[k]}` !== "")
        const query = keys.map(k => `${k}=${encodeURIComponent(params[k])}`).join("&")
        const url = this.apiBase + path + (query.length > 0 ? "?" + query : "")
        const { t, s } = this.signParams(params)
        const headers = { ...this.baseHeaders, "t": t, "s": s }
        if (token) headers["authorization"] = `Bearer ${token}`
        return await Network.get(url, headers)
    }

    async apiGet(path, params) {
        const res = await this.request(path, params)
        if (res.status !== 200) {
            let msg = ""
            try {
                msg = JSON.parse(res.body).message || ""
            } catch (e) {
                msg = ""
            }
            throw `请求失败(${res.status})${msg ? "：" + msg : ""}`
        }
        let json
        try {
            json = JSON.parse(res.body)
        } catch (e) {
            throw "接口返回的不是 JSON"
        }
        if (json.code !== 200) throw json.message || "接口返回错误"
        return json.data
    }

    toComic(item) {
        const tags = []
        for (const c of (item.cat || [])) {
            if (c && c.name) tags.push(c.name)
        }
        return new Comic({
            id: `${item.id}`,
            title: item.name || "",
            cover: item.cover || "",
            tags: tags,
            description: item.intro || "",
        })
    }

    async login(email, password) {
        const mail = (email ?? (this.loadSetting("email") || "")).trim()
        const pwd = (password ?? (this.loadSetting("password") || "")).trim()
        if (mail.length === 0 || pwd.length === 0) {
            throw "Vomic 需要登录才能阅读：请在源设置中填写邮箱与密码"
        }
        const { t, s } = this.signParams({})
        const res = await Network.post(
            this.apiBase + "/login",
            { ...this.baseHeaders, "t": t, "s": s, "content-type": "application/json" },
            JSON.stringify({ email: mail, password: pwd })
        )
        let json
        try {
            json = JSON.parse(res.body)
        } catch (e) {
            throw `登录失败(${res.status})`
        }
        const token = (json.data && json.data.token) || json.token || ""
        if (!token) throw `登录失败：${json.message || "未获取到 token"}`
        this.saveData("token", token)
        return token
    }

    get token() {
        try {
            return this.loadData("token") || ""
        } catch (e) {
            return ""
        }
    }

    explore = [
        {
            title: "最近更新",
            type: "multiPageComicList",
            load: async (page) => {
                const list = await this.apiGet("/c/getUpdateBook", { page: page, limit: 15 })
                const comics = (list || []).map(it => this.toComic(it))
                return { comics: comics, maxPage: comics.length >= 15 ? page + 1 : page }
            },
            loadNext: async (next) => {
                const list = await this.apiGet("/c/getUpdateBook", { page: next, limit: 15 })
                return { comics: (list || []).map(it => this.toComic(it)), next: next + 1 }
            },
        },
        {
            title: "全部作品",
            type: "multiPageComicList",
            load: async (page) => {
                const list = await this.apiGet("/c/getCartoonList", { page: page, limit: 20 })
                const comics = (list || []).map(it => this.toComic(it))
                return { comics: comics, maxPage: comics.length >= 20 ? page + 1 : page }
            },
            loadNext: async (next) => {
                const list = await this.apiGet("/c/getCartoonList", { page: next, limit: 20 })
                return { comics: (list || []).map(it => this.toComic(it)), next: next + 1 }
            },
        },
    ]

    category = {
        title: "Vomic",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: Vomic.categories.map(c => c[1]),
                categoryParams: Vomic.categories.map(c => `${c[0]}`),
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            const list = await this.apiGet("/c/getCartoonList", { page: page, limit: 20, cat_id: param })
            const comics = (list || []).map(it => this.toComic(it))
            return { comics: comics, maxPage: comics.length >= 20 ? page + 1 : page }
        },
    }

    search = {
        load: async (keyword, options, page) => {
            const list = await this.apiGet("/c/getCartoonList", { page: page, limit: 10, keyword: keyword })
            const comics = (list || []).map(it => this.toComic(it))
            return { comics: comics, maxPage: comics.length >= 10 ? page + 1 : page }
        },
        loadNext: async (keyword, options, next) => {
            const list = await this.apiGet("/c/getCartoonList", { page: next, limit: 10, keyword: keyword })
            return { comics: (list || []).map(it => this.toComic(it)), next: next + 1 }
        },
    }

    comic = {
        loadInfo: async (id) => {
            const info = await this.apiGet("/c/getCartoonInfoV1", { car_id: id })
            const chapters = {}
            for (const group of (info.chapter_list || [])) {
                const gname = group.name || ""
                for (const c of (group.values || [])) {
                    let title = c.name || `第${c.id}话`
                    if (gname.length > 0 && gname !== "正篇" && gname !== title) title = `${gname} - ${title}`
                    chapters[`${c.id}`] = title
                }
            }
            const tags = []
            for (const c of (info.cat || [])) {
                if (c && c.name) tags.push(c.name)
            }
            if (typeof info.tags === "string" && info.tags.trim().length > 0) {
                tags.push(info.tags.trim())
            }
            return new ComicDetails({
                title: info.name || "",
                subtitle: info.webInfo && info.webInfo.name ? info.webInfo.name : "",
                cover: info.cover || "",
                description: info.intro || "",
                tags: tags,
                chapters: chapters,
                uploader: info.author || "",
                updateTime: info.updated_at || "",
                url: `https://vomicmh.com/detail/${id}`,
                likesCount: info.likes_num || 0,
                commentCount: info.comment_num || 0,
            })
        },

        loadEp: async (comicId, epId) => {
            let token = this.token
            let res = await this.request("/c/getChapterInfo", { c_id: epId }, token)
            if (res.status !== 200) {
                token = await this.login()
                res = await this.request("/c/getChapterInfo", { c_id: epId }, token)
            }
            if (res.status !== 200) {
                throw "Vomic 需要登录才能阅读：请在源设置中填写邮箱与密码"
            }
            const json = JSON.parse(res.body)
            if (json.code !== 200) throw json.message || "接口返回错误"
            const images = []
            for (const img of ((json.data && json.data.images) || [])) {
                if (img && img.url) images.push(img.url)
            }
            if (images.length === 0) throw "本章没有图片"
            return { images: images }
        },

        onImageLoad: (url) => {
            return new ImageLoadingConfig({
                url: url,
                headers: {
                    "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
                    "referer": "https://vomicmh.com/",
                },
            })
        },
    }

    account = {
        login: async (account, password) => {
            await this.login(account, password)
        },
        logout: async () => {
            this.deleteData("token")
        },
    }

    settings = {
        email: {
            title: "邮箱（阅读需要登录）",
            type: "input",
            default: "",
        },
        password: {
            title: "密码",
            type: "input",
            default: "",
        },
        api_base: {
            title: "API 地址（留空使用默认）",
            type: "input",
            default: "",
        },
    }
}
