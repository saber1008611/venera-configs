class Manwa extends ComicSource {
    name = "漫蛙漫画"
    key = "manwa"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://manwadz.cc"

    // 站点前端 base.js 里的 BaseUtil.AES_KEY，图片与封面都用它做 AES-256-CBC 解密
    static AES_KEY = "0B6666A0-BB59-1381-B746-a0E4C9AC"
    static mirrors = ["https://manwadz.cc", "https://manwali.cc", "https://manwaqi.cc", "https://manwaye.cc"]
    static ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
    static categories = [
        ["全部", "comic"],
        ["古风", "gufeng"],
        ["玄幻", "xuanhuan"],
        ["校园", "xiaoyuan"],
    ]

    get baseUrl() {
        let custom = ""
        try {
            custom = this.loadSetting("base_url") || ""
        } catch (e) {
            custom = ""
        }
        custom = (custom + "").trim()
        if (custom.length > 0) return custom.replace(/\/+$/, "")
        return Manwa.mirrors[0]
    }

    get headers() {
        return {
            "user-agent": Manwa.ua,
            "accept": "application/json, text/html, */*",
            "referer": this.baseUrl + "/",
        }
    }

    async apiGet(path) {
        const res = await Network.get(this.baseUrl + path, this.headers)
        if (res.status !== 200) throw `请求失败(${res.status})：${path}`
        let json
        try {
            json = JSON.parse(res.body)
        } catch (e) {
            throw "接口返回的不是 JSON，站点可能已变更"
        }
        if (json.code !== 200) throw json.msg || "接口返回错误"
        return json.data
    }

    toComic(item) {
        const tags = []
        const raw = item.tags || item.tag
        if (Array.isArray(raw)) {
            for (const t of raw) tags.push(typeof t === "string" ? t : (t.name || ""))
        } else if (typeof raw === "string") {
            for (const t of raw.split(/[,，]/)) {
                if (t.trim()) tags.push(t.trim())
            }
        }
        return new Comic({
            id: `${item.id}`,
            title: item.title || item.alias || "",
            cover: item.cover || item.pic || item.image || "",
            tags: tags,
            description: item.description || item.intro || "",
        })
    }

    async loadCatePage(param, page) {
        const cat = param && param.length > 0 ? param : "comic"
        const url = `${this.baseUrl}/cate?category=${cat}&page=${page}`
        const res = await Network.get(url, {
            "user-agent": Manwa.ua,
            "accept": "text/html",
            "referer": this.baseUrl + "/",
        })
        if (res.status !== 200) throw `请求失败(${res.status})`
        const doc = new HtmlDocument(res.body)
        const comics = []
        const nodes = doc.querySelectorAll("#dataList section .item")
        for (const node of nodes) {
            const a = node.querySelector("a")
            if (!a) continue
            const href = a.attributes["href"] || ""
            const m = href.match(/\/comic\/(\d+)/)
            if (!m) continue
            const img = node.querySelector(".thumb_img")
            const titleNode = node.querySelector(".title")
            const tags = []
            for (const b of node.querySelectorAll(".badge span")) {
                const t = (b.text || "").trim()
                if (t) tags.push(t)
            }
            comics.push(new Comic({
                id: m[1],
                title: titleNode ? (titleNode.text || "").trim() : "",
                cover: img ? (img.attributes["data-src"] || "") : "",
                tags: tags,
            }))
        }
        const pm = res.body.match(/Pages:\s*(\d+)/)
        const maxPage = pm ? parseInt(pm[1]) : page
        doc.dispose()
        return { comics: comics, maxPage: maxPage }
    }

    explore = [
        {
            title: "最近更新",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.loadCatePage("comic", page)
            },
            loadNext: async (next) => {
                const r = await this.loadCatePage("comic", next)
                return { comics: r.comics, next: next + 1 }
            },
        },
    ]

    category = {
        title: "漫蛙漫画",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: Manwa.categories.map(c => c[0]),
                categoryParams: Manwa.categories.map(c => c[1]),
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            return await this.loadCatePage(param, page)
        },
    }

    search = {
        load: async (keyword, options, page) => {
            const data = await this.apiGet(`/api/search?keyword=${encodeURIComponent(keyword)}&page=${page}`)
            const list = data.list || []
            const total = data.total || list.length
            return {
                comics: list.map(it => this.toComic(it)),
                maxPage: Math.max(1, Math.ceil(total / Math.max(1, list.length))),
            }
        },
        loadNext: async (keyword, options, next) => {
            const data = await this.apiGet(`/api/search?keyword=${encodeURIComponent(keyword)}&page=${next}`)
            const list = data.list || []
            return { comics: list.map(it => this.toComic(it)), next: next + 1 }
        },
    }

    comic = {
        loadInfo: async (id) => {
            const info = await this.apiGet(`/api/comic/${id}`)
            const chData = await this.apiGet(`/api/comic/${id}/chapters`)
            const chapters = {}
            for (const c of (chData.list || [])) {
                const cid = `${c.id}`
                let name = c.title || `第${cid}话`
                if (c.isVip) name += "（需会员）"
                chapters[cid] = name
            }
            const tags = []
            const raw = info.tags
            if (Array.isArray(raw)) {
                for (const t of raw) tags.push(typeof t === "string" ? t : (t.name || ""))
            } else if (typeof raw === "string") {
                for (const t of raw.split(/[,，]/)) {
                    if (t.trim()) tags.push(t.trim())
                }
            }
            return new ComicDetails({
                title: info.title || info.alias || "",
                subtitle: info.alias && info.alias !== info.title ? info.alias : "",
                cover: info.cover || "",
                description: info.intro || info.description || "",
                tags: tags,
                chapters: chapters,
                uploader: info.author || "",
                updateTime: info.editTime ? `${info.editTime}` : "",
            })
        },

        loadEp: async (comicId, epId) => {
            const data = await this.apiGet(`/api/comic/image/${epId}`)
            const images = []
            for (const img of (data.images || [])) {
                if (img && img.url) images.push(img.url)
            }
            if (images.length === 0) throw "本章没有图片"
            return { images: images }
        },

        onImageLoad: (url) => {
            return new ImageLoadingConfig({
                url: url,
                headers: {
                    "user-agent": Manwa.ua,
                    "referer": `${this.baseUrl}/`,
                },
                onResponse: function (buffer) {
                    return decryptManwaImage(buffer)
                },
            })
        },

        onThumbnailLoad: (url) => {
            return new ImageLoadingConfig({
                url: url,
                headers: {
                    "user-agent": Manwa.ua,
                    "referer": `${this.baseUrl}/`,
                },
                onResponse: function (buffer) {
                    return decryptManwaImage(buffer)
                },
            })
        },
    }

    settings = {
        base_url: {
            title: "站点地址（留空自动选择）",
            type: "input",
            default: "",
            validator: "^$|^https?://",
        },
    }
}

// 站点把图片做了 AES-256-CBC 加密：前 16 字节是 IV，其余是密文，PKCS7 补位
function decryptManwaImage(buffer) {
    const bytes = new Uint8Array(buffer)
    if (bytes.length < 32) return bytes
    const b0 = bytes[0]
    const b1 = bytes[1]
    if ((b0 === 0xff && b1 === 0xd8) || (b0 === 0x89 && b1 === 0x50) ||
        (b0 === 0x47 && b1 === 0x49) || (b0 === 0x52 && b1 === 0x49)) {
        return bytes
    }
    const iv = bytes.slice(0, 16)
    const ct = bytes.slice(16)
    const key = Convert.encodeUtf8(Manwa.AES_KEY).slice(0, 32)
    const plain = new Uint8Array(Convert.decryptAesCbc(ct, key, iv))
    let n = plain.length
    if (n > 0) {
        const pad = plain[n - 1]
        if (pad > 0 && pad <= 16 && n - pad > 0) n -= pad
    }
    return plain.slice(0, n)
}
