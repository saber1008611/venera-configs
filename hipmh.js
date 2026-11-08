class Hipmh extends ComicSource {
    name = "嬉皮漫画"
    key = "hipmh"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://m.hipmh.com"

    apiBase = "https://hipapi1.s3file.top"
    cdnBase = "https://hip-cf-1.s3imgs.top"
    cdnBackup = "https://hip-tx-1.s3imgs.top"

    get headers() {
        return {
            "accept": "application/json",
            "user-agent": "okhttp/4.12.0",
            "referer": "https://m.hipmh.com/",
        }
    }

    async apiGet(path) {
        const res = await Network.get(this.apiBase + path, this.headers)
        if (res.status !== 200) {
            throw `请求失败(${res.status})：${this.apiBase + path}`
        }
        let json
        try {
            json = JSON.parse(res.body)
        } catch (e) {
            throw "接口返回的不是 JSON，站点可能已变更"
        }
        if (json.code !== 200) {
            throw json.message || "接口返回错误"
        }
        return json.data
    }

    // 把 API 返回的 mid（形如 bToyODAwMg-slug-1867-20876）压缩成短 id
    shortMid(mid) {
        const idx = mid.indexOf("-")
        return idx < 0 ? mid : mid.slice(0, idx)
    }

    // hid 由 base64url("m:<mid>-c:<cid>") + "-" + base64url("<mid>:<num>") 组成
    parseHid(hid) {
        for (let i = 0; i < hid.length; i++) {
            if (hid[i] !== "-") continue
            const text = this.b64urlDecode(hid.slice(0, i))
            const m = text && text.match(/^m:(\d+)-c:(\d+)$/)
            if (m) return { mid: m[1], cid: m[2] }
        }
        throw "章节标识解析失败：" + hid
    }

    b64urlDecode(s) {
        let t = s.replace(/-/g, "+").replace(/_/g, "/")
        while (t.length % 4 !== 0) t += "="
        try {
            return Convert.decodeUtf8(Convert.decodeBase64(t))
        } catch (e) {
            return null
        }
    }

    // 复刻原 App ChapterContentKt.decodeImages
    decodeImages(payload) {
        if (!payload.startsWith("qM9") || !payload.endsWith("Z7")) {
            throw "圖片編碼格式已變更，請更新擴展"
        }
        if (payload.length <= 10) throw "圖片編碼資料損壞"
        const s = payload.substring(3, payload.length - 2)
        const len = s.length
        const a = len - 5
        const q1 = Math.floor(a / 3)
        const b = a - q1
        const q2 = Math.floor(b / 2)
        const c = b - q2
        const v4 = q2
        const v5 = q2 + 2
        const v2 = c + q2 + 2
        if (s.substring(v4, v5) !== "Vx") throw "圖片編碼資料損壞"
        if (s.substring(v2, v2 + 3) !== "pL0") throw "圖片編碼資料損壞"
        const t = s.substring(v2 + 3) + s.substring(0, v4) + s.substring(v5, v2)
        const chunks = []
        for (let i = 0; i < t.length; i += 7) {
            chunks.push(t.substring(i, i + 7))
        }
        let joined = ""
        for (let i = 0; i < chunks.length; i++) {
            joined += i % 2 === 1 ? chunks[i].split("").reverse().join("") : chunks[i]
        }
        const from = "_-9876543210abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        const to = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        let mapped = ""
        for (const ch of joined) {
            const idx = from.indexOf(ch)
            if (idx < 0) throw "圖片編碼含有無效字元"
            mapped += to[idx]
        }
        return Convert.decodeUtf8(Convert.decodeBase64(mapped))
    }

    imageUrl(path) {
        if (!path) return ""
        if (path.startsWith("http")) return path
        return this.cdnBase + (path.startsWith("/") ? path : "/" + path)
    }

    toComic(item) {
        return new Comic({
            id: item.mid ?? item.id,
            title: item.title,
            cover: this.imageUrl(item.vertical_image_url || item.cover_image_url),
            tags: (item.genres || []).map(g => typeof g === "string" ? g : g.name),
            description: item.description ?? "",
        })
    }

    explore = [
        {
            title: "最近更新",
            type: "multiPageComicList",
            load: async (page) => {
                const data = await this.apiGet(`/v1/mangas?page=${page}`)
                return {
                    comics: (data.items || []).map(it => this.toComic(it)),
                    maxPage: data.total_pages ?? page,
                }
            },
            loadNext: async (next) => {
                const data = await this.apiGet(`/v1/mangas?page=${next}`)
                return {
                    comics: (data.items || []).map(it => this.toComic(it)),
                    next: next + 1,
                }
            },
        },
        {
            title: "连载中",
            type: "multiPageComicList",
            load: async (page) => {
                const data = await this.apiGet(`/v1/mangas?status=ongoing&page=${page}`)
                return {
                    comics: (data.items || []).map(it => this.toComic(it)),
                    maxPage: data.total_pages ?? page,
                }
            },
            loadNext: async (next) => {
                const data = await this.apiGet(`/v1/mangas?status=ongoing&page=${next}`)
                return {
                    comics: (data.items || []).map(it => this.toComic(it)),
                    next: next + 1,
                }
            },
        },
        {
            title: "已完结",
            type: "multiPageComicList",
            load: async (page) => {
                const data = await this.apiGet(`/v1/mangas?status=completed&page=${page}`)
                return {
                    comics: (data.items || []).map(it => this.toComic(it)),
                    maxPage: data.total_pages ?? page,
                }
            },
            loadNext: async (next) => {
                const data = await this.apiGet(`/v1/mangas?status=completed&page=${next}`)
                return {
                    comics: (data.items || []).map(it => this.toComic(it)),
                    next: next + 1,
                }
            },
        },
    ]

    category = {
        title: "嬉皮漫画",
        parts: [
            {
                name: "连载状态",
                type: "fixed",
                categories: ["全部", "连载中", "已完结"],
                categoryParams: ["all", "ongoing", "completed"],
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            const status = param && param !== "all" ? `status=${param}&` : ""
            const data = await this.apiGet(`/v1/mangas?${status}page=${page}`)
            return {
                comics: (data.items || []).map(it => this.toComic(it)),
                maxPage: data.total_pages ?? page,
            }
        },
    }

    search = {
        load: async (keyword, options, page) => {
            const data = await this.apiGet(`/v1/search?q=${encodeURIComponent(keyword)}&page=${page}&page_size=20`)
            const list = Array.isArray(data.data) ? data.data : (data.items || [])
            return {
                comics: list.map(it => this.toComic(it)),
                maxPage: data.total_pages ?? page,
            }
        },
        loadNext: async (keyword, options, next) => {
            const data = await this.apiGet(`/v1/search?q=${encodeURIComponent(keyword)}&page=${next}&page_size=20`)
            const list = Array.isArray(data.data) ? data.data : (data.items || [])
            return {
                comics: list.map(it => this.toComic(it)),
                next: next + 1,
            }
        },
    }

    comic = {
        loadInfo: async (id) => {
            const mid = this.shortMid(id)
            const info = await this.apiGet(`/v1/manga?mid=${encodeURIComponent(mid)}`)
            const chapters = {}
            let page = 1
            let totalPages = 1
            while (page <= totalPages && page <= 20) {
                const list = await this.apiGet(`/v1/manga/chapters?mid=${encodeURIComponent(mid)}&page=${page}&per_page=50`)
                const items = list.items || []
                for (const it of items) {
                    chapters[it.hid] = it.title || `第${it.chapter_number}话`
                }
                totalPages = list.total_pages ?? 1
                if (items.length === 0) break
                page += 1
            }
            const tags = []
            for (const g of info.genres || []) tags.push(g.name)
            for (const t of info.tags || []) {
                if (!tags.includes(t.name)) tags.push(t.name)
            }
            for (const c of info.categories || []) {
                if (!tags.includes(c.name)) tags.push(c.name)
            }
            return new ComicDetails({
                title: info.title,
                subtitle: (info.alt_titles || [])[0] ?? "",
                cover: this.imageUrl(info.cover_image_url || info.vertical_image_url),
                description: info.description ?? "",
                tags: tags,
                chapters: chapters,
                uploader: (info.authors || []).map(a => a.name).join(", "),
                updateTime: info.updated_at,
                url: `https://m.hipmh.com/${info.slug || ""}`,
                stars: (info.stats && info.stats.likes) ? Math.min(10, info.stats.likes) : 0,
            })
        },

        loadEp: async (comicId, epId) => {
            const { mid, cid } = this.parseHid(epId)
            const data = await this.apiGet(`/v2/chapter?mid=${mid}&cid=${cid}`)
            const list = JSON.parse(this.decodeImages(data.images))
            const images = []
            for (const p of list) images.push(this.imageUrl(p))
            if (images.length === 0) throw "本章没有图片"
            return { images: images }
        },

        onImageLoad: (url) => {
            return new ImageLoadingConfig({
                url: url,
                headers: {
                    "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
                    "referer": "https://m.hipmh.com/",
                },
            })
        },
    }

    settings = {}
}
