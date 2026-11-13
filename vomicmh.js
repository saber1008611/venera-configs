/**
 * vomic漫+（vomicmh.com）
 *
 * 移植自 Mihon 扩展 zh.vomic（Apache-2.0），保留原签名算法、筛选语义与接口路径，
 * 改用 Venera 的 JS 接口实现。
 *
 * 说明：章节图片接口需要登录态（Bearer token），未登录时只能浏览列表与详情。
 */

class VomicPlus extends ComicSource {
    name = "vomic漫+"
    key = "vomicmh"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://vomicmh.com"

    static salt = "hhhasda"
    static initialHash = 0x9e3779b9

    static mangaLimit = 20
    static searchLimit = 10
    static updateLimit = 15

    static categories = [
        ["4", "冒险"], ["5", "搞笑"], ["6", "动作"], ["7", "科幻"], ["8", "爱情"],
        ["9", "侦探"], ["10", "竞技"], ["11", "魔法"], ["12", "校园"], ["13", "百合"],
        ["14", "耽美"], ["15", "历史"], ["16", "战争"], ["17", "宅系"], ["18", "治愈"],
        ["20", "武侠"], ["21", "职场"], ["22", "神鬼"], ["23", "奇幻"], ["24", "生活"],
        ["25", "其他"], ["26", "热血"], ["27", "古风"], ["28", "悬疑"], ["29", "都市"],
        ["30", "架空"], ["31", "青春"], ["32", "剧情"], ["34", "犯罪"], ["35", "致郁"],
        ["36", "纯爱"], ["37", "恋爱"], ["38", "体育"], ["39", "末世"], ["40", "少女"],
        ["41", "重生"], ["43", "美食"],
    ]

    static rotl(value, bits) {
        return ((value << bits) | (value >>> (32 - bits))) >>> 0
    }

    /// 与原扩展的 SignInterceptor.hash 等价（32 位整数运算）。
    static signHash(data, timestamp) {
        let key = VomicPlus.salt
        let keyLength = key.length
        let value = VomicPlus.initialHash

        for (let i = 0; i < keyLength; i++) {
            value = VomicPlus.rotl(value ^ (key.charCodeAt(i) & 0xff), 7)
        }

        let text = data + timestamp + key
        for (let i = 0; i < text.length; i++) {
            let k = key.charCodeAt(i % keyLength) & 0xff
            let mix = i % 2 === 0 ? k * 8 : k >> 1
            value = (VomicPlus.rotl(value ^ (text.charCodeAt(i) & 0xff), 5) ^ mix) >>> 0
        }

        for (let i = 0; i < keyLength; i++) {
            value = VomicPlus.rotl(value ^ ((key.charCodeAt(i) & 0xff) * 16), 9)
        }

        let hex = value.toString(16)
        while (hex.length < 8) {
            hex = "0" + hex
        }
        return hex
    }

    get baseUrl() {
        let value = this.loadSetting("base_url")
        if (typeof value === "string" && value.length > 0) {
            return value.replace(/\/+$/, "")
        }
        return "https://vomicmh.com"
    }

    get apiUrl() {
        let host = this.baseUrl.replace(/^https?:\/\//, "")
        return `https://api.${host}/pics_new/pics`
    }

    get token() {
        let value = this.loadData("token")
        return typeof value === "string" ? value : ""
    }

    /// 按原扩展的规则给请求签名：只对 query 参数签名，body 不参与。
    signedHeaders(params, withAuth) {
        let timestamp = String(Math.floor(Date.now() / 1000))
        let keys = Object.keys(params || {}).sort()
        let payload = []
        for (let key of keys) {
            let value = params[key]
            if (value === undefined || value === null || value === "") {
                continue
            }
            payload.push(`${key}=${value}`)
        }
        let encoded = Convert.encodeBase64(
            Convert.encodeUtf8(`${payload.join("&")}${timestamp}${VomicPlus.salt}`)
        )
        let headers = {
            "user-agent": "Dart/3.13 (dart:io)",
            "platform": "android",
            "hide-content": "0",
            "name": "pics",
            "version": "1.2.1",
            "t": timestamp,
            "s": VomicPlus.signHash(encoded, timestamp),
        }
        if (withAuth) {
            let token = this.token
            if (token.length > 0) {
                headers["authorization"] = "Bearer " + token
            }
        }
        return headers
    }

    buildUrl(path, params) {
        let url = this.apiUrl + path
        let pairs = []
        for (let key of Object.keys(params || {})) {
            let value = params[key]
            if (value === undefined || value === null) {
                continue
            }
            pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        }
        if (pairs.length > 0) {
            url += "?" + pairs.join("&")
        }
        return url
    }

    async getJson(path, params, withAuth) {
        params = params || {}
        let res = await Network.get(this.buildUrl(path, params), this.signedHeaders(params, withAuth))
        if (res.status === 401) {
            throw "需要登录：请在「源设置」里填写邮箱与密码"
        }
        if (res.status !== 200) {
            throw `请求失败: ${res.status}`
        }
        let json = JSON.parse(res.body)
        if (json["code"] !== undefined && json["code"] !== 200) {
            throw json["message"] || `请求失败: ${json["code"]}`
        }
        return json["data"]
    }

    parseComic(comic) {
        let tags = []
        for (let category of comic["cat"] || []) {
            tags.push(category["name"])
        }
        for (let tag of comic["tag"] || []) {
            tags.push(tag["name"])
        }
        if (typeof comic["tags"] === "string" && comic["tags"].length > 0) {
            for (let tag of comic["tags"].split(/\s+/)) {
                if (tag.length > 0) {
                    tags.push(tag)
                }
            }
        }
        let description = `👁️ ${comic["view_num"] || 0} - ❤️ ${comic["likes_num"] || 0}`
        if (comic["intro"] && comic["intro"].length > 0) {
            description += "\n\n" + comic["intro"]
        }
        return {
            id: String(comic["id"]),
            title: comic["name"],
            subTitle: comic["author"] || "",
            cover: comic["cover"],
            tags: tags,
            description: description,
        }
    }

    /// 筛选面板 → 查询参数。
    filterParams(filters, options) {
        filters = filters || {}
        options = options || []
        let params = {}
        let sort = filters["排序"] !== undefined ? filters["排序"] : options[1]
        if (sort !== undefined && sort !== null && sort !== "") {
            params["sort"] = sort
        }
        let status = filters["状态"] !== undefined ? filters["状态"] : options[2]
        if (status) {
            params["process"] = status
        }
        let creativity = filters["来源"] !== undefined ? filters["来源"] : options[3]
        if (creativity) {
            params["creativity"] = creativity
        }
        let region = filters["地区"] !== undefined ? filters["地区"] : options[4]
        if (region) {
            params["region"] = region
        }
        let displayType = filters["类型"] !== undefined ? filters["类型"] : options[5]
        if (displayType) {
            params["dis_type"] = displayType
        }
        let category = filters["分类"] !== undefined ? filters["分类"] : options[0]
        if (category && category !== "0") {
            params["cat_id"] = category
        }
        return params
    }

    explore = [
        {
            title: "vomic漫+",
            type: "multiPageComicList",
            optionList: [
                { label: "有搜索关键字时，下面的筛选项会被忽略", type: "header" },
                {
                    label: "分类",
                    type: "select",
                    options: [["0", "全部"]]
                        .concat(VomicPlus.categories)
                        .map(item => `${item[0]}-${item[1]}`),
                    default: "0",
                },
                {
                    label: "排序",
                    type: "select",
                    options: ["-默认", "hot_value-最热", "process_at-最新"],
                    default: "",
                },
                {
                    label: "状态",
                    type: "select",
                    options: ["-全部", "连载中-连载中", "已完结-已完结"],
                    default: "",
                },
                {
                    label: "来源",
                    type: "select",
                    options: ["-全部", "原创-原创", "汉化-汉化", "转载-转载"],
                    default: "",
                },
                {
                    label: "地区",
                    type: "select",
                    options: [
                        "-全部", "大陆-大陆", "日本-日本", "韩国-韩国",
                        "港台-港台", "欧美-欧美", "其他-其他",
                    ],
                    default: "",
                },
                {
                    label: "类型",
                    type: "select",
                    options: ["-全部", "条漫-条漫", "页漫-页漫", "其他-其他"],
                    default: "",
                },
            ],
            load: async (page, options, filters) => {
                let params = this.filterParams(filters, options)
                params["page"] = String(page)
                params["limit"] = String(VomicPlus.mangaLimit)
                let data = await this.getJson("/c/getCartoonList", params, false)
                let list = (data || []).map(comic => this.parseComic(comic))
                return {
                    comics: list,
                    maxPage: list.length >= VomicPlus.mangaLimit ? page + 1 : page,
                }
            },
        }
    ]

    category = {
        title: "vomic漫+",
        parts: [
            {
                name: "分类",
                type: "fixed",
                itemType: "category",
                categories: VomicPlus.categories.map(item => item[1]),
                categoryParams: VomicPlus.categories.map(item => item[0]),
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let params = this.filterParams({}, options)
            if (param) {
                params["cat_id"] = String(param)
            }
            params["page"] = String(page)
            params["limit"] = String(VomicPlus.mangaLimit)
            let data = await this.getJson("/c/getCartoonList", params, false)
            let list = (data || []).map(comic => this.parseComic(comic))
            return {
                comics: list,
                maxPage: list.length >= VomicPlus.mangaLimit ? page + 1 : page,
            }
        },
        optionList: [
            {
                label: "排序",
                type: "select",
                options: ["-默认", "hot_value-最热", "process_at-最新"],
                default: "",
            },
            {
                label: "状态",
                type: "select",
                options: ["-全部", "连载中-连载中", "已完结-已完结"],
                default: "",
            },
        ],
    }

    search = {
        load: async (keyword, options, page) => {
            let params = {
                page: String(page),
                limit: String(VomicPlus.searchLimit),
                keyword: keyword,
            }
            let data = await this.getJson("/c/getCartoonList", params, false)
            let list = (data || []).map(comic => this.parseComic(comic))
            return {
                comics: list,
                maxPage: list.length >= VomicPlus.searchLimit ? page + 1 : page,
            }
        },
        optionList: [],
    }

    comic = {
        loadInfo: async (id) => {
            let data = await this.getJson("/c/getCartoonInfoV1", { car_id: String(id) }, false)
            let tags = []
            for (let category of data["cat"] || []) {
                tags.push(category["name"])
            }
            for (let tag of data["tag"] || []) {
                tags.push(tag["name"])
            }
            let statusText = data["process"] || ""
            let description = data["intro"] || ""
            let details = {}
            details["作者"] = [data["author"] || ""]
            if (statusText.length > 0) {
                details["状态"] = [statusText]
            }
            if (data["region"]) {
                details["地区"] = [data["region"]]
            }
            if (data["dis_type"]) {
                details["类型"] = [data["dis_type"]]
            }
            if (tags.length > 0) {
                details["标签"] = tags
            }
            let chapters = new Map()
            let groups = data["chapter_list"] || []
            let chapterCount = 0
            for (let group of groups) {
                for (let chapter of group["values"] || []) {
                    chapterCount++
                }
            }
            for (let group of groups) {
                let groupName = group["name"] || ""
                for (let chapter of group["values"] || []) {
                    let name = String(chapter["name"] || "")
                    if (chapterCount > 0 && groups.length > 1 && groupName.length > 0) {
                        name = `${groupName}-${name}`
                    }
                    chapters.set(String(chapter["id"]), name)
                }
            }
            return {
                title: data["name"],
                cover: data["cover"],
                description: description,
                tags: details,
                chapters: chapters,
            }
        },

        loadEp: async (comicId, epId) => {
            let data = await this.getJson(
                "/c/getChapterInfo",
                { c_id: String(epId) },
                true
            )
            let images = []
            for (let image of data["img_list"] || []) {
                if (image && image["url"]) {
                    images.push(image["url"])
                }
            }
            if (images.length === 0) {
                throw "這一話沒有圖片（可能需要登入會員，或該話為付費內容）"
            }
            return { images: images }
        },
    }

    account = {
        login: async (account, pwd) => {
            let headers = this.signedHeaders({}, false)
            headers["content-type"] = "application/json;charset=UTF-8"
            let res = await Network.post(
                this.apiUrl + "/login",
                headers,
                JSON.stringify({ identity: account, password: pwd })
            )
            if (res.status !== 200) {
                throw `登录失败: ${res.status}`
            }
            let json = JSON.parse(res.body)
            let token = (json["data"] || {})["token"]
            if (!token) {
                throw json["message"] || "登录失败"
            }
            this.saveData("token", token)
            return "ok"
        },
        logout: () => {
            this.deleteData("token")
        },
        registerWebsite: "https://vomicmh.com",
    }

    settings = {
        base_url: {
            title: "线路",
            type: "input",
            validator: "^https?://.+$",
            default: "https://vomicmh.com",
        },
    }
}
