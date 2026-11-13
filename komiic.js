/**
 * Komiic（原名 Komiic 漫画），接口是 GraphQL。
 *
 * 移植自 Mihon 扩展 zh.komiic（Apache-2.0，作者 keiyoushi 团队），
 * 保留原来的查询结构、筛选语义与章节命名，改用 Venera 的 JS 接口实现。
 */

class Komiic extends ComicSource {
    name = "Komiic"
    key = "komiic"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://komiic.cc"

    static defaultBase = "https://komiic.cc"

    // 官方接口一页 30 条；改小会让服务端筛选结果出现异常（Mihon 扩展的注释）。
    static pageSize = 30

    static comicBody = `{
        id
        title
        description
        status
        imageUrl
        authors { id name }
        categories { id name }
        warnings
    }`

    /// 类型（分类）表。接口是动态的，这里保存一份快照，
    /// 需要更新时把 allCategory 查询的结果贴回来即可。
    static categories = [
        ["1", "愛情"], ["5", "搞笑"], ["97", "劇情"], ["58", "戲劇"], ["8", "冒險"],
        ["13", "格鬥"], ["64", "動作"], ["54", "戰鬥"], ["59", "生存"], ["35", "武俠"],
        ["11", "魔幻"], ["12", "魔法"], ["57", "黑暗奇幻"], ["17", "科幻"], ["36", "機戰"],
        ["277", "賽博龐克"], ["7", "懸疑"], ["23", "推理"], ["25", "偵探"], ["93", "犯罪"],
        ["9", "恐怖"], ["48", "驚悚"], ["60", "策略"], ["18", "百合"], ["16", "耽美"],
        ["92", "友情"], ["247", "親情"], ["70", "性轉換"], ["26", "偽娘"], ["4", "校園"],
        ["10", "職場"], ["6", "生活"], ["78", "日常"], ["276", "家庭"], ["47", "異世界"],
        ["56", "轉生"], ["88", "穿越"], ["2", "後宮"], ["31", "社會"], ["61", "政治"],
        ["32", "歷史"], ["255", "宮廷"], ["33", "戰爭"], ["27", "美食"], ["85", "醫療"],
        ["37", "音樂"], ["34", "舞蹈"], ["22", "競技"], ["40", "體育"], ["55", "復仇"],
        ["42", "黑道"], ["114", "賭博"], ["164", "同人"], ["81", "青春"], ["21", "熱血"],
        ["15", "勵志"], ["184", "成長"], ["19", "治癒"], ["129", "溫馨"], ["20", "萌系"],
        ["3", "神鬼"], ["87", "心理"], ["62", "黑暗"], ["86", "致鬱"], ["113", "少女"],
        ["246", "青年"], ["123", "女性向"], ["14", "宅男"], ["51", "成人"], ["28", "四格"],
        ["24", "雜誌"],
    ]

    static orderOptions = [
        ["DATE_UPDATED", "更新"],
        ["MONTH_VIEWS", "本月觀看"],
        ["VIEWS", "觀看數"],
        ["FAVORITE_COUNT", "喜愛數"],
    ]

    static statusOptions = [
        ["", "全部"],
        ["ONGOING", "連載"],
        ["END", "完結"],
    ]

    static sexyOptions = [
        ["", "全部"],
        ["0", "無"],
        ["1", "1"],
        ["2", "2"],
        ["3", "3"],
        ["4", "≥4"],
        ["5", "5"],
    ]

    get base() {
        let value = this.loadSetting("base_url")
        if (typeof value === "string" && value.length > 0) {
            return value.replace(/\/+$/, "")
        }
        return Komiic.defaultBase
    }

    headers() {
        return {
            "content-type": "application/json",
            "accept": "application/json",
            "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "origin": this.base,
            "referer": this.base + "/",
        }
    }

    /// 发送 GraphQL 请求，返回 `data` 字段。
    async query(query, variables, operationName) {
        let body = JSON.stringify({
            query: query,
            variables: variables || {},
            operationName: operationName || "",
        })
        let res = await Network.post(this.base + "/api/query", this.headers(), body)
        if (res.status !== 200) {
            throw `请求失败: ${res.status}`
        }
        let json = JSON.parse(res.body)
        if (json.errors && json.errors.length > 0) {
            throw json.errors[0]["message"] || "接口返回错误"
        }
        return json["data"]
    }

    /// 站点把封面放在 public.komiic.com 上，而国内网络到 Cloudflare 的这个
    /// 域名会被重置。Mihon 扩展的做法是：把任何 *.komiic.com 换成当前线路的
    /// 同一个子域（如 public.komiic.cc），这里照做。
    rewriteImage(url) {
        if (typeof url !== "string" || url.length === 0) {
            return url
        }
        let host = this.base.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
        return url.replace(
            /^(https?):\/\/([a-z0-9.-]*?)komiic\.com/i,
            (match, scheme, prefix) => `${scheme}://${prefix}${host}`
        )
    }

    parseComic(comic) {
        let author = (comic["authors"] || []).map(author => author["name"]).join("，")
        let tags = (comic["categories"] || []).map(category => category["name"])
        for (let warning of comic["warnings"] || []) {
            tags.push(warning)
        }
        return {
            id: comic["id"],
            title: comic["title"],
            subTitle: author,
            cover: this.rewriteImage(comic["imageUrl"]),
            tags: tags,
            description: comic["description"] || "",
        }
    }

    pagination(offset, orderBy, status, sexyLevel) {
        return {
            "offset": offset,
            "orderBy": orderBy || "DATE_UPDATED",
            "status": status || "",
            "asc": false,
            "limit": Komiic.pageSize,
            "sexyLevel": sexyLevel === "" || sexyLevel === undefined ? null : parseInt(sexyLevel),
        }
    }

    /// 列表页：有关键字以外的情况都走这里。
    async listingQuery(page, orderBy, status, sexyLevel, categoryIds) {
        let offset = (page - 1) * Komiic.pageSize
        let pagination = this.pagination(offset, orderBy, status, sexyLevel)
        let operation
        let query
        let variables = { "pagination": pagination }
        if (categoryIds && categoryIds.length > 0) {
            operation = "comicByCategories"
            variables["categoryId"] = categoryIds
            query =
                `query comicByCategories($categoryId: [ID!]!, $pagination: Pagination!) {
                    comics: comicByCategories(categoryId: $categoryId, pagination: $pagination) ${Komiic.comicBody}
                }`
        } else if (orderBy === "DATE_UPDATED") {
            operation = "commonQuery"
            query =
                `query commonQuery($pagination: Pagination!) {
                    comics: recentUpdate(pagination: $pagination) ${Komiic.comicBody}
                }`
        } else {
            operation = "commonQuery"
            query =
                `query commonQuery($pagination: Pagination!) {
                    comics: hotComics(pagination: $pagination) ${Komiic.comicBody}
                }`
        }
        let data = await this.query(query, variables, operation)
        let list = (data["comics"] || []).map(comic => this.parseComic(comic))
        return {
            comics: list,
            maxPage: list.length >= Komiic.pageSize ? page + 1 : page,
        }
    }

    /// 把筛选面板的值整理成查询参数。
    readFilters(filters, options) {
        filters = filters || {}
        options = options || []
        let orderBy = filters["排序"] || options[3] || Komiic.orderOptions[0][0]
        let status = filters["狀態"] !== undefined ? filters["狀態"] : options[1]
        let sexy = filters["色氣程度"] !== undefined ? filters["色氣程度"] : options[2]
        let categoryIds = []
        let rawCategory = filters["類型"]
        if (rawCategory !== undefined && rawCategory !== null && rawCategory !== "") {
            try {
                let parsed = typeof rawCategory === "string" ? JSON.parse(rawCategory) : rawCategory
                if (Array.isArray(parsed)) {
                    categoryIds = parsed.map(id => String(id))
                }
            } catch (e) {
                categoryIds = []
            }
        }
        return {
            orderBy: orderBy,
            status: status || "",
            sexy: sexy === undefined ? "" : sexy,
            categoryIds: categoryIds,
        }
    }

    explore = [
        {
            title: "Komiic",
            type: "multiPageComicList",
            optionList: [
                { label: "篩選條件（只在沒有關鍵字時生效）", type: "header" },
                {
                    label: "排序",
                    type: "select",
                    options: Komiic.orderOptions.map(item => `${item[0]}-${item[1]}`),
                    default: "DATE_UPDATED",
                },
                {
                    label: "狀態",
                    type: "select",
                    options: Komiic.statusOptions.map(item => `${item[0]}-${item[1]}`),
                    default: "",
                },
                {
                    label: "色氣程度",
                    type: "select",
                    options: Komiic.sexyOptions.map(item => `${item[0]}-${item[1]}`),
                    default: "",
                },
                {
                    label: "類型（可多選，是「同時包含」）",
                    type: "multi-select",
                    options: Komiic.categories.map(item => `${item[0]}-${item[1]}`),
                    default: [],
                },
            ],
            load: async (page, options, filters) => {
                let values = this.readFilters(filters, options)
                return await this.listingQuery(
                    page,
                    values.orderBy,
                    values.status,
                    values.sexy,
                    values.categoryIds
                )
            },
        },
    ]

    category = {
        title: "Komiic",
        parts: [
            {
                name: "類型",
                type: "fixed",
                itemType: "category",
                categories: Komiic.categories.map(item => item[1]),
                categoryParams: Komiic.categories.map(item => item[0]),
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let values = this.readFilters({}, options)
            let categoryId = param ? String(param) : null
            return await this.listingQuery(
                page,
                values.orderBy,
                values.status,
                values.sexy,
                categoryId ? [categoryId] : []
            )
        },
        optionList: [
            {
                label: "排序",
                type: "select",
                options: Komiic.orderOptions.map(item => `${item[0]}-${item[1]}`),
                default: "DATE_UPDATED",
            },
            {
                label: "狀態",
                type: "select",
                options: Komiic.statusOptions.map(item => `${item[0]}-${item[1]}`),
                default: "",
            },
        ],
    }

    search = {
        load: async (keyword, options, page) => {
            if (page > 1) {
                return { comics: [], maxPage: 1 }
            }
            let query =
                `query searchComicsAndAuthors($keyword: String!) {
                    searchComicsAndAuthors(keyword: $keyword) {
                        comics ${Komiic.comicBody}
                    }
                }`
            let data = await this.query(query, { "keyword": keyword }, "searchComicsAndAuthors")
            let list = ((data["searchComicsAndAuthors"] || {})["comics"] || []).map(comic =>
                this.parseComic(comic)
            )
            return { comics: list, maxPage: 1 }
        },
        optionList: [],
    }

    comic = {
        loadInfo: async (id) => {
            let query =
                `query mangaQuery($comicId: ID!) {
                    comicById(comicId: $comicId) ${Komiic.comicBody}
                    chaptersByComicId(comicId: $comicId) { id serial type size dateCreated }
                }`
            let data = await this.query(query, { "comicId": String(id) }, "mangaQuery")
            let comic = data["comicById"] || {}
            let chapters = (data["chaptersByComicId"] || []).slice()
            // 章節在前、卷在後，各自按序號從小到大（與其它源一致：第 1 話在最上面）。
            // 想倒過來看在詳情頁切換排序，那個選擇會被記住。
            chapters.sort((a, b) => {
                if (a["type"] !== b["type"]) {
                    return a["type"] < b["type"] ? 1 : -1
                }
                let serialA = parseFloat(a["serial"])
                let serialB = parseFloat(b["serial"])
                if (isNaN(serialA)) serialA = 0
                if (isNaN(serialB)) serialB = 0
                return serialA - serialB
            })
            let chapterMap = new Map()
            for (let chapter of chapters) {
                let name
                if (chapter["type"] === "chapter") {
                    name = `第 ${chapter["serial"]} 話`
                } else if (chapter["type"] === "book") {
                    name = `第 ${chapter["serial"]} 卷`
                } else {
                    name = String(chapter["serial"])
                }
                chapterMap.set(String(chapter["id"]), name)
            }
            let tags = {}
            tags["作者"] = (comic["authors"] || []).map(author => author["name"])
            tags["類型"] = (comic["categories"] || []).map(category => category["name"])
            let warnings = comic["warnings"] || []
            if (warnings.length > 0) {
                tags["警告"] = warnings
            }
            let statusText = comic["status"] === "END" ? "完結" : "連載"
            tags["狀態"] = [statusText]
            return {
                title: comic["title"],
                cover: this.rewriteImage(comic["imageUrl"]),
                description: comic["description"] || "",
                tags: tags,
                chapters: chapterMap,
            }
        },

        loadEp: async (comicId, epId) => {
            let query =
                `query imagesByChapterId($chapterId: ID!) {
                    imagesByChapterId(chapterId: $chapterId) { kid }
                }`
            let data = await this.query(query, { "chapterId": String(epId) }, "imagesByChapterId")
            let images = (data["imagesByChapterId"] || []).map(
                image => `${this.base}/api/image/${image["kid"]}`
            )
            if (images.length === 0) {
                throw "這一話沒有圖片"
            }
            return { images: images }
        },

        /**
         * 圖片服務只認「章節內頁」形式的 Referer，缺了會直接 400。
         * imageKey 形如 https://komiic.cc/api/image/<kid>。
         */
        onImageLoad: (imageKey, comicId, ep) => {
            let referer
            if (ep !== undefined && ep !== null && String(ep).length > 0) {
                referer = `${this.base}/comic/${comicId}/chapter/${ep}/page/1`
            } else {
                referer = `${this.base}/comic/${comicId}/`
            }
            return {
                headers: {
                    "referer": referer,
                    "accept": "image/*,*/*",
                    "user-agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                },
            }
        },

        /// 封面同樣走圖片服務，Referer 用作品頁。
        onThumbnailLoad: (imageKey, comicId) => {
            return {
                headers: {
                    "referer": `${this.base}/comic/${comicId}/`,
                    "accept": "image/*,*/*",
                },
            }
        },

        onClickTag: (namespace, tag) => {
            if (namespace === "作者") {
                return { action: "search", keyword: tag }
            }
            throw "暫不支援由此標籤檢索"
        },
    }

    settings = {
        base_url: {
            title: "線路",
            type: "input",
            validator: "^https?://.+$",
            default: Komiic.defaultBase,
        },
    }
}
