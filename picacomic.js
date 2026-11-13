/**
 * 哔咔漫画（PicACG）
 *
 * 移植自 Mihon 扩展 zh.picacomic（Apache-2.0，作者 keiyoushi 团队）。
 * 接口：https://picaapi.picacomic.com ，所有请求都要带 api-key + time + nonce + signature
 * （signature = HMAC-SHA256(固定 key, "路径+时间戳+nonce+方法+api-key" 的小写)）。
 * 该 API 现在必须登录才能读列表，所以源里内置了账号登录（Token 存在源数据里）。
 *
 * 注意：picaapi.picacomic.com 的域名解析在本机会被污染，需要 hosts 指向直连 IP
 * （地址可从 http://68.183.234.72/init 拿到）。
 */

class Picacomic extends ComicSource {

    name = "哔咔漫画"

    key = "picacomic"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://picacomic.com"

    // 走 go2778 镜像：picaapi.picacomic.com 的 DNS 在本机被污染，
    // 而 go2778 是同一套接口的备用域名（haka_comic 默认用的就是它）。
    static apiHost = "picaapi.go2778.com"

    static apiUrl = "https://picaapi.go2778.com"

    /// 备用域名，DNS 不通时可以在设置里换
    static apiHosts = ["picaapi.go2778.com", "picaapi.picacomic.com"]

    static apiKey = "C69BAF41DA5ABD1FFEDC6D2FEA56B"

    /// 固定 nonce（与 haka_comic 一致，服务端不校验随机性）
    static nonce = "4ce7a7aa759b40f794d189a88b84aba8"

    static appBuildVersion = "45"

    // 与 Mihon 扩展里 encrypt() 的 hmac 键逐字节一致（里面有反斜杠、引号、反引号）
    static signKey = "~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn"

    /// 排序：新到旧 / 旧到新 / 最多爱心 / 最多绅士指名
    static sortOptions = [
        ["dd", "新到旧"],
        ["da", "旧到新"],
        ["ld", "最多爱心"],
        ["vd", "最多绅士指名"],
    ]

    /// 榜单（comics/leaderboard 的 tt 参数）
    static rankOptions = [
        ["H24", "过去24小时最热门"],
        ["D7", "过去7天最热门"],
        ["D30", "过去30天最热门"],
    ]

    /// 分类（与 Mihon 的 CategoryFilter 一致，去掉「全部」）
    static categories = [
        "大家都在看", "牛牛不哭", "那年今天", "官方都在看",
        "嗶咔漢化", "全彩", "長篇", "同人", "短篇", "圓神領域",
        "碧藍幻想", "CG雜圖", "純愛", "百合花園", "後宮閃光", "單行本", "姐姐系",
        "妹妹系", "SM", "人妻", "NTR", "強暴",
        "艦隊收藏", "Love Live", "SAO 刀劍神域", "Fate",
        "東方", "禁書目錄", "Cosplay",
        "英語 ENG", "生肉", "性轉換", "足の恋", "非人類",
        "耽美花園", "偽娘哲學", "扶他樂園", "重口地帶", "歐美", "WEBTOON",
    ]

    get token() {
        let value = this.loadData("token")
        return value ? String(value) : ""
    }

    /// 32 位随机串（nonce）
    static randomString(length) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        let out = ""
        for (let i = 0; i < length; i++) {
            out += chars.charAt(randomInt(0, chars.length - 1))
        }
        return out
    }

    /// 生成一次请求所需的全部头（含签名与 token）
    buildHeaders(path, method) {
        let time = String(Math.floor(Date.now() / 1000))
        let nonce = Picacomic.nonce
        // 签名用的是「相对路径 + query」，不带开头的斜杠（带斜杠会被判签名错误，
        // 服务端只回一个空的 success）。
        let signedPath = path.startsWith("/") ? path.substring(1) : path
        let raw = (signedPath + time + nonce + method + Picacomic.apiKey).toLowerCase()
        let signature = Convert.hmacString(
            Convert.encodeUtf8(Picacomic.signKey),
            Convert.encodeUtf8(raw),
            "sha256"
        )
        let headers = {
            "api-key": Picacomic.apiKey,
            "app-channel": "1",
            "app-version": "2.2.1.3.3.4",
            "app-uuid": "defaultUuid",
            "app-platform": "android",
            "app-build-version": Picacomic.appBuildVersion,
            "user-agent": "okhttp/3.8.1",
            "accept": "application/vnd.picacomic.com.v1+json",
            "image-quality": "original",
            "content-type": "application/json; charset=UTF-8",
            "time": time,
            "nonce": nonce,
            "signature": signature,
        }
        let token = this.token
        if (token.length > 0) {
            headers["authorization"] = token
        }
        return headers
    }

    /// 登录；成功返回 true（App 会把账号密码存进源数据，下次可自动重登）
    async login(account, password) {
        let path = "/auth/sign-in"
        let res = await Network.post(
            Picacomic.apiUrl + path,
            this.buildHeaders(path, "POST"),
            JSON.stringify({ email: account, password: password })
        )
        if (res.status !== 200) {
            throw `登录失败（HTTP ${res.status}）`
        }
        let json = JSON.parse(res.body)
        let token = (json["data"] || {})["token"]
        if (!token) {
            throw `登录失败：${json["message"] || "未知错误"}`
        }
        this.saveData("token", token)
        return true
    }

    /// 没有 token 时用已保存的账号密码自动登录一次
    async ensureToken() {
        if (this.token.length > 0) {
            return
        }
        let saved = this.loadData("account")
        if (Array.isArray(saved) && saved.length >= 2) {
            await this.login(saved[0], saved[1])
            return
        }
        throw "哔咔漫画需要登录：请在源设置里登录后再浏览"
    }

    /**
     * 发一次带签名的请求。path 形如 "/comics?page=1&s=dd"。
     * 401 时用保存的账号自动重登并重试一次。
     */
    async request(path, method = "GET", body = null) {
        await this.ensureToken()
        let res = await this.send(path, method, body)
        if (res.status === 401) {
            this.deleteData("token")
            await this.ensureToken()
            res = await this.send(path, method, body)
        }
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        let json = JSON.parse(res.body)
        if (json["code"] !== undefined && json["code"] !== 200) {
            throw `哔咔接口错误（${json["code"]}）：${json["message"] || ""}`
        }
        return json["data"] || {}
    }

    async send(path, method, body) {
        let url = Picacomic.apiUrl + path
        let headers = this.buildHeaders(path, method)
        if (method === "POST") {
            return await Network.post(url, headers, body === null ? "" : body)
        }
        return await Network.get(url, headers)
    }

    /// 图片地址跟着接口线路走：storage-b.picacomic.com 的 DNS 在本机被污染，
    /// go2778 镜像提供同路径的图片（同 haka_comic 里 proxyUrl 的做法）。
    static imageUrl(fileServer, path) {
        if (!fileServer || !path) {
            return ""
        }
        let host = String(fileServer)
        if (Picacomic.apiHost.indexOf("go2778") >= 0) {
            host = host.replace("picacomic", "go2778")
        }
        if (host.indexOf("static") >= 0) {
            return `${host}/${path}`
        }
        return `${host}/static/${path}`
    }

    /// 列表项 / 详情项统一转成 App 的 Comic
    static toComic(comic) {
        let thumb = comic["thumb"] || {}
        let cover = Picacomic.imageUrl(thumb["fileServer"], thumb["path"])
        let author = comic["author"]
        if (author === undefined || author === null || author === "") {
            author = comic["chineseTeam"]
        }
        let tags = []
        for (let category of comic["categories"] || []) {
            if (!tags.includes(category)) {
                tags.push(category)
            }
        }
        for (let tag of comic["tags"] || []) {
            if (!tags.includes(tag)) {
                tags.push(tag)
            }
        }
        return {
            id: comic["_id"],
            title: comic["title"],
            subTitle: author || "",
            cover: cover,
            tags: tags,
            description: `${comic["pagesCount"] || 0} 页 · ${comic["epsCount"] || 0} 话`,
        }
    }

    /// 分页列表（data.comics）
    static parsePagedList(data) {
        let comics = data["comics"] || {}
        let docs = comics["docs"] || []
        return {
            comics: docs.map(Picacomic.toComic),
            maxPage: comics["pages"] || 1,
        }
    }

    /// 榜单路径（与 Mihon 的 RankFilter 一致）
    static rankPaths = {
        "H24": "/comics/leaderboard?tt=H24&ct=VC",
        "D7": "/comics/leaderboard?tt=D7&ct=VC",
        "D30": "/comics/leaderboard?tt=D30&ct=VC",
    }

    /// 榜单接口返回的 data.comics 是数组（不分页）
    static parseRankList(data) {
        let docs = data["comics"] || []
        return {
            comics: docs.map(Picacomic.toComic),
            maxPage: 1,
        }
    }

    explore = [
        {
            title: "哔咔漫画",
            type: "multiPageComicList",
            optionList: [
                {
                    label: "排序",
                    type: "select",
                    options: Picacomic.sortOptions.map(e => `${e[0]}-${e[1]}`),
                },
                {
                    label: "类型",
                    type: "select",
                    options: ["-全部"].concat(Picacomic.categories.map(e => `${e}-${e}`)),
                },
                {
                    label: "榜单",
                    type: "select",
                    options: ["-不启用"].concat(Picacomic.rankOptions.map(e => `${e[0]}-${e[1]}`)),
                },
                {
                    label: "只看收藏",
                    type: "checkbox",
                    default: false,
                },
            ],
            load: async (page, options, filters) => {
                filters = filters || {}
                options = options || []
                let sort = filters["排序"] ?? options[0] ?? "dd"
                let category = filters["类型"] ?? options[1] ?? ""
                let rank = filters["榜单"] ?? options[2] ?? ""
                let onlyFavourite = (filters["只看收藏"] ?? options[3]) === "true"
                if (onlyFavourite) {
                    let data = await this.request(`/users/favourite?page=${page}&s=${sort}`)
                    return Picacomic.parsePagedList(data)
                }
                if (rank && Picacomic.rankPaths[rank]) {
                    let data = await this.request(Picacomic.rankPaths[rank])
                    return Picacomic.parseRankList(data)
                }
                let path = `/comics?page=${page}&s=${sort}`
                if (category && category !== "全部") {
                    path += `&c=${encodeURIComponent(category)}`
                }
                let data = await this.request(path)
                return Picacomic.parsePagedList(data)
            },
        },
    ]

    category = {
        title: "哔咔漫画",
        parts: [
            {
                name: "类型",
                type: "fixed",
                categories: Picacomic.categories,
                categoryParams: Picacomic.categories,
                itemType: "category",
            },
            {
                name: "榜单",
                type: "fixed",
                categories: Picacomic.rankOptions.map(e => e[1]),
                categoryParams: Picacomic.rankOptions.map(e => e[0]),
                itemType: "category",
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            options = options || []
            if (param && Picacomic.rankPaths[param]) {
                let data = await this.request(Picacomic.rankPaths[param])
                return Picacomic.parseRankList(data)
            }
            let sort = options[0] ?? "dd"
            let path = `/comics?page=${page}&s=${sort}`
            if (param) {
                path += `&c=${encodeURIComponent(param)}`
            }
            let data = await this.request(path)
            return Picacomic.parsePagedList(data)
        },
        optionList: [
            {
                label: "排序",
                type: "select",
                options: Picacomic.sortOptions.map(e => `${e[0]}-${e[1]}`),
            },
        ],
    }

    search = {
        load: async (keyword, options, page) => {
            options = options || []
            let sort = options[0] ?? "dd"
            let path = `/comics/advanced-search?page=${page}`
            let data = await this.request(
                path,
                "POST",
                JSON.stringify({ keyword: keyword, sort: sort })
            )
            return Picacomic.parsePagedList(data)
        },
        optionList: [
            {
                label: "排序",
                type: "select",
                options: Picacomic.sortOptions.map(e => `${e[0]}-${e[1]}`),
            },
        ],
    }

    comic = {
        loadInfo: async (id) => {
            let data = await this.request(`/comics/${id}`)
            let comic = data["comic"] || {}
            let thumb = comic["thumb"] || {}
            let cover = ""
            if (thumb["fileServer"] && thumb["path"]) {
                cover = `${thumb["fileServer"]}/static/${thumb["path"]}`
            }

            // 章节列表（可能多页）
            let epsPath = `/comics/${id}/eps?page=1`
            let epsData = await this.request(epsPath)
            let eps = epsData["eps"] || {}
            let docs = (eps["docs"] || []).slice()
            let totalPages = eps["pages"] || 1
            for (let page = 2; page <= totalPages; page++) {
                let more = await this.request(`/comics/${id}/eps?page=${page}`)
                docs = docs.concat((more["eps"] || {})["docs"] || [])
            }

            // 新章节在前
            docs.sort((a, b) => (b["order"] || 0) - (a["order"] || 0))
            let chapters = new Map()
            for (let ep of docs) {
                let name = ep["title"] || `第 ${ep["order"]} 话`
                chapters.set(String(ep["order"]), name)
            }

            let tags = {}
            let categories = comic["categories"] || []
            if (categories.length > 0) {
                tags["类型"] = categories
            }
            let extraTags = comic["tags"] || []
            if (extraTags.length > 0) {
                tags["標籤"] = extraTags
            }
            if (comic["author"]) {
                tags["作者"] = [comic["author"]]
            }
            if (comic["chineseTeam"]) {
                tags["漢化"] = [comic["chineseTeam"]]
            }
            tags["狀態"] = [comic["finished"] ? "已完结" : "连载中"]

            return {
                title: comic["title"],
                cover: cover,
                description: comic["description"] || "",
                tags: tags,
                chapters: chapters,
            }
        },

        loadEp: async (comicId, epOrder) => {
            let first = await this.request(`/comics/${comicId}/order/${epOrder}/pages?page=1`)
            let pages = first["pages"] || {}
            let docs = (pages["docs"] || []).slice()
            let totalPages = pages["pages"] || 1
            for (let page = 2; page <= totalPages; page++) {
                let more = await this.request(
                    `/comics/${comicId}/order/${epOrder}/pages?page=${page}`
                )
                docs = docs.concat((more["pages"] || {})["docs"] || [])
            }
            let images = []
            for (let item of docs) {
                let media = item["media"] || {}
                if (media["fileServer"] && media["path"]) {
                    images.push(Picacomic.imageUrl(media["fileServer"], media["path"]))
                }
            }
            if (images.length === 0) {
                throw "这一话没有图片"
            }
            return { images: images }
        },

        /// 图片走存储域名，不需要鉴权头，只补一个 UA
        onImageLoad: (imageKey, comicId, ep) => {
            return {
                headers: {
                    "user-agent": "okhttp/3.8.1",
                    "accept": "image/*,*/*",
                },
            }
        },
    }

    account = {
        login: async (account, pwd) => {
            return await this.login(account, pwd)
        },
        logout: () => {
            this.deleteData("token")
        },
        registerWebsite: null,
    }
}
