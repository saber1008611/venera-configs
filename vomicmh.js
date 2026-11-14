/**
 * vomic漫+（vomicmh.com）
 *
 * 移植自 Mihon 扩展 zh.vomicmh v1.4.4（Apache-2.0，反编译 G:\code\venera\_probe\vomicmh_src）。
 * 使用 Mihon 扩展同款 API：http://43.143.245.32/pics（腾讯云国内直连可达），
 * 无 t/s 签名（旧版 apk 里根本没有 SignInterceptor，签名版 pics_new 接口已不可用）。
 *
 * 请求头（HeadersInterceptor）：name=pics, platform=android, showsuccess=false,
 * showtoast=false, version=1.0.10；登录后带 Authorization: Bearer <token>。
 * 图片 CDN cdm.vomicer.com 需要 user-agent: Dart/3.7 (dart:io)。
 */

class VomicPlus extends ComicSource {
    name = "vomic漫+"
    key = "vomicmh"
    version = "1.1.0"
    minAppVersion = "1.6.0"
    url = "https://vomicmh.com"

    static apiUrl = "http://43.143.245.32/pics"

    static mangaLimit = 12
    static searchLimit = 10

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

    /// Mihon 扩展的排行榜（FilterKt.rankFilter）
    static ranks = [
        ["-1", "不查看"], ["3", "漫评榜"], ["1", "热门榜"], ["2", "收藏榜"],
        ["4", "更新榜"], ["7", "连载榜"], ["8", "完结榜"], ["9", "差评榜"],
    ]

    get token() {
        let value = this.loadData("token")
        return typeof value === "string" ? value : ""
    }

    /// 等价于 HeadersInterceptor + AuthorizationInterceptor
    apiHeaders(withAuth) {
        let headers = {
            "name": "pics",
            "platform": "android",
            "showsuccess": "false",
            "showtoast": "false",
            "version": "1.0.10",
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
        let url = VomicPlus.apiUrl + path
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
        let res = await Network.get(this.buildUrl(path, params), this.apiHeaders(withAuth))
        if (res.status === 401) {
            throw "需要登录：请在「源设置」里填写账号与密码"
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

    /// ComicSummary.toSManga 等价映射（tags 是空格分隔字符串，cat 是对象数组）
    parseComic(comic) {
        let tags = []
        if (typeof comic["tags"] === "string" && comic["tags"].length > 0) {
            for (let tag of comic["tags"].split(/\s+/)) {
                if (tag.length > 0) {
                    tags.push(tag)
                }
            }
        }
        for (let category of comic["cat"] || []) {
            if (category && category["name"]) {
                tags.push(category["name"])
            }
        }
        let description = `⭐ ${comic["score"] || "?"} - 👁️ ${comic["view_num"] || 0} - ❤️ ${comic["collect_num"] || 0}`
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

    /// 筛选面板 → getCartoonList 查询参数（对齐 FilterKt 各过滤器的 pathWord）
    filterParams(filters, options) {
        filters = filters || {}
        options = options || []
        let params = {}
        // 分类：默认 "0"（全部）
        let category = filters["分类"] !== undefined ? filters["分类"] : options[0]
        if (category && category !== "0") {
            params["cat_id"] = category
        }
        // 排序：默认 process_at（最新）
        let sort = filters["排序"] !== undefined ? filters["排序"] : options[1]
        params["sort"] = sort || "process_at"
        // 状态：默认空（全部）
        let status = filters["状态"] !== undefined ? filters["状态"] : options[2]
        if (status) {
            params["process"] = status
        }
        // 来源：默认 "全部"
        let creativity = filters["来源"] !== undefined ? filters["来源"] : options[3]
        params["creativity"] = creativity || "全部"
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
                    options: ["process_at-最新", "hot_value-最热"],
                    default: "process_at",
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
                    options: ["全部-全部", "原创-原创", "汉化-汉化", "转载-转载"],
                    default: "全部",
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
                options: ["process_at-最新", "hot_value-最热"],
                default: "process_at",
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
                if (category && category["name"]) {
                    tags.push(category["name"])
                }
            }
            if (typeof data["tags"] === "string" && data["tags"].length > 0) {
                for (let tag of data["tags"].split(/\s+/)) {
                    if (tag.length > 0) {
                        tags.push(tag)
                    }
                }
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
            if (data["score"]) {
                details["评分"] = [String(data["score"])]
            }
            if (tags.length > 0) {
                details["标签"] = tags
            }
            // ComicDetailResult.toSChapterList：chapter_list[].values[]，
            // 章节名带 group_name（正篇等）前缀，url 为 chapter/{car_id}/{id}
            let chapters = new Map()
            let groups = data["chapter_list"] || []
            for (let group of groups) {
                for (let chapter of group["values"] || []) {
                    let name = String(chapter["name"] || "")
                    let groupName = chapter["group_name"] || ""
                    if (groupName.length > 0 && groupName !== "正篇") {
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

        // ContentResult.toPageList：c_id + clarity=gq；img_list[].url。
        // 需要 Bearer token（服务器对未登录返回 401）。
        loadEp: async (comicId, epId) => {
            let data = await this.getJson(
                "/c/getChapterInfo",
                { c_id: String(epId), clarity: "gq" },
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

        /// 图片 CDN（cdm.vomicer.com）要求 Dart UA，等价于 Mihon 扩展的
        /// HeadersInterceptor。Venera 通过 onImageLoad 返回的 headers 生效。
        onImageLoad: (imageKey, comicId, epId) => {
            return {
                url: imageKey,
                headers: { "user-agent": "Dart/3.7 (dart:io)" },
            }
        },

        /// 封面同样托管在 cdm.vomicer.com。
        onThumbnailLoad: (imageKey, comicId) => {
            return {
                url: imageKey,
                headers: { "user-agent": "Dart/3.7 (dart:io)" },
            }
        },
    }

    account = {
        // TokenProvider.V1.getToken：FormBody identity/password，无签名、无 JSON body
        login: async (account, pwd) => {
            let headers = this.apiHeaders(false)
            headers["content-type"] = "application/x-www-form-urlencoded"
            let body = `identity=${encodeURIComponent(account)}&password=${encodeURIComponent(pwd)}`
            let res = await Network.post(VomicPlus.apiUrl + "/login", headers, body)
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
}
