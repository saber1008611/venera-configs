/**
 * 紳士漫畫 (wnacg) 漫画源。
 *
 * 站点 `www.wnacg.site` 的 TCP/TLS 握手会被按 SNI 重置，但同一主机的 QUIC
 * (HTTP/3/UDP) 不被拦截，所以本源的每个请求都带 `allowHttp3Fallback`，
 * 由客户端在 TCP 失败后自动改用 HTTP/3 重试（见 lib/network/image_http3_fallback.dart）。
 *
 * 解析规则移植自 MIHON 扩展 `zh.wnacg`（WNACG.kt / Filters.kt，Apache-2.0）。
 */
class WNACG extends ComicSource {
    name = "紳士漫畫"
    key = "wnacg"
    version = "1.1.0"
    minAppVersion = "1.6.0"
    url = "https://www.wnacg.site"

    static defaultBaseUrl = "https://www.wnacg.site"

    // 分类（值 → 名称），与站点 cate 参数一致
    static categories = [
        ["", "全部"],
        ["5", "同人志"],
        ["12", "　└ 日语"],
        ["16", "　└ English"],
        ["1", "　└ 汉化"],
        ["2", "　└ CG画集"],
        ["6", "单行本"],
        ["13", "　└ 日语"],
        ["17", "　└ English"],
        ["9", "　└ 汉化"],
        ["7", "杂志&短篇"],
        ["14", "　└ 日语"],
        ["18", "　└ English"],
        ["10", "　└ 汉化"],
        ["3", "写真&Cosplay"],
        ["22", "3D&漫画"],
        ["23", "　└ 汉化"],
        ["24", "　└ 其他"],
        ["37", "AI图集"],
    ]

    static rankingTypes = [
        ["day", "今日排行"],
        ["week", "本周排行"],
        ["month", "本月排行"],
        ["year", "今年排行"],
    ]

    // 排序（值 → 名称），空值就是站点默认的「最近更新」
    static rankingOptions = [
        ["", "最新更新"],
        ["day", "今日排行"],
        ["week", "本周排行"],
        ["month", "本月排行"],
        ["year", "今年排行"],
    ]

    get base() {
        let configured = ""
        try {
            configured = String(this.loadSetting("base_url") || "").trim()
        } catch (e) {}
        if (configured) return configured.replace(/\/+$/, "")
        return WNACG.defaultBaseUrl
    }

    headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": this.base + "/",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
        }
    }

    /**
     * 所有请求都允许 HTTP/3 回退：TCP 握手被重置时客户端会自动改用 QUIC。
     * 注意 `Network.get` 的第三个参数会被当成 body 传给宿主，必须用 sendRequest。
     */
    async fetchBody(label, url) {
        let res = await Network.sendRequest(
            "GET", url, this.headers(), undefined, { allowHttp3Fallback: true }
        )
        if (res.status !== 200) throw label + " 请求失败: " + res.status
        return res.body
    }

    // ============ 列表解析 ============
    parseList(body) {
        let doc = new HtmlDocument(body)
        let comics = []
        try {
            let items = doc.querySelectorAll(".gallary_item")
            for (let i = 0; i < items.length; i++) {
                let linkEl = items[i].querySelector(".title > a")
                if (!linkEl) continue
                let href = linkEl.attributes["href"] || ""
                let aid = (href.match(/photos-index-aid-(\d+)/) || [])[1]
                if (!aid) continue
                let title = String(linkEl.text || "").trim()
                let img = items[i].querySelector("img")
                let cover = ""
                if (img) {
                    let src = String(img.attributes["src"] || "").trim()
                    if (src) {
                        if (src.startsWith("//")) cover = "https:" + src
                        else if (src.startsWith("http://")) cover = "https://" + src.slice(7)
                        else if (src.startsWith("/")) cover = this.base + src
                        else cover = src
                    }
                }
                comics.push({ id: aid, title: title, cover: cover })
            }
        } finally {
            doc.dispose()
        }
        return comics
    }

    // 是否还有下一页：`span.thispage + a`
    hasNextPage(body, page) {
        let doc = new HtmlDocument(body)
        let result = false
        try {
            let current = doc.querySelector("span.thispage")
            if (current) {
                let sibling = current.nextElementSibling
                if (sibling && String(sibling.localName || "").toLowerCase() === "a") {
                    result = true
                }
            }
            if (!result) {
                // 兜底：页尾分页器里出现 page-(N+1)
                let links = doc.querySelectorAll("div.f_left.paginator a")
                for (let i = 0; i < links.length; i++) {
                    let href = String(links[i].attributes["href"] || "")
                    let m = href.match(/albums-(?:index|favorite_ranking)-page-(\d+)/)
                    if (m && parseInt(m[1], 10) > page) {
                        result = true
                        break
                    }
                }
            }
        } finally {
            doc.dispose()
        }
        return result
    }

    listUrl(param, page) {
        if (param && param.indexOf("rank_") === 0) {
            let type = param.slice(5)
            return this.base + "/albums-favorite_ranking-page-" + page + "-type-" + type + ".html"
        }
        let cate = ""
        if (param && param.indexOf("cate_") === 0) cate = param.slice(5)
        let catePart = cate ? "-cate-" + cate : ""
        return this.base + "/albums-index-page-" + page + catePart + ".html"
    }

    async loadList(param, page) {
        let body = await this.fetchBody("list", this.listUrl(param, page))
        let comics = this.parseList(body)
        let next = this.hasNextPage(body, page)
        return { comics: comics, maxPage: next ? page + 1 : page }
    }

    // 发现页的筛选：排序与分类可以同时生效
    listUrlFor(ranking, cate, page) {
        let catePart = cate ? "-cate-" + cate : ""
        if (ranking) {
            return this.base + "/albums-favorite_ranking-page-" + page + "-type-" + ranking + catePart + ".html"
        }
        return this.base + "/albums-index-page-" + page + catePart + ".html"
    }

    async loadFilteredList(ranking, cate, page) {
        let body = await this.fetchBody("list", this.listUrlFor(ranking, cate, page))
        let comics = this.parseList(body)
        let next = this.hasNextPage(body, page)
        return { comics: comics, maxPage: next ? page + 1 : page }
    }

    // ============ 发现 ============
    explore = [
        {
            title: "紳士漫畫-最近更新",
            type: "multiPageComicList",
            optionList: [
                {
                    label: "排序",
                    type: "select",
                    options: WNACG.rankingOptions.map(r => r[0] + "-" + r[1]),
                },
                {
                    label: "分类",
                    type: "select",
                    options: WNACG.categories.map(c => c[0] + "-" + c[1]),
                },
            ],
            load: async (page, options) => {
                let ranking = (options && options[0]) || ""
                let cate = (options && options[1]) || ""
                try {
                    return await this.loadFilteredList(ranking, cate, page)
                } catch (e) {
                    // 排序与分类组合的 URL 站点偶尔不认，退回单条件
                    if (ranking && cate) {
                        return await this.loadFilteredList(ranking, "", page)
                    }
                    throw e
                }
            },
        },
    ]

    // ============ 分类 ============
    category = {
        title: "紳士漫畫",
        parts: [
            {
                name: "分类",
                type: "fixed",
                itemType: "category",
                categories: WNACG.categories.map(c => c[1]),
                categoryParams: WNACG.categories.map(c => "cate_" + c[0]),
            },
            {
                name: "排行",
                type: "fixed",
                itemType: "category",
                categories: WNACG.rankingTypes.map(r => r[1]),
                categoryParams: WNACG.rankingTypes.map(r => "rank_" + r[0]),
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            try {
                return await this.loadList(param, page)
            } catch (e) {
                return { comics: [], maxPage: page }
            }
        },
        optionList: [],
    }

    // ============ 搜索 ============
    search = {
        load: async (keyword, options, page) => {
            let url = this.base + "/search/index.php?s=create_time_DESC&q=" +
                encodeURIComponent(keyword) + "&p=" + page
            try {
                let body = await this.fetchBody("search", url)
                let comics = this.parseList(body)
                let next = this.hasNextPage(body, page)
                return { comics: comics, maxPage: next ? page + 1 : page }
            } catch (e) {
                return { comics: [], maxPage: page }
            }
        },
        optionList: [],
    }

    // ============ 详情 / 章节 ============
    comic = {
        loadInfo: async (id) => {
            let url = this.base + "/photos-index-aid-" + id + ".html"
            let body = await this.fetchBody("detail", url)
            let doc = new HtmlDocument(body)
            let title = id
            let cover = ""
            let author = ""
            let description = ""
            let tags = []
            let status = 0
            let chapters = {}
            try {
                let h2 = doc.querySelector("h2")
                if (h2) title = String(h2.text || "").trim() || id

                let authorEl = doc.querySelector("div.uwuinfo p")
                if (authorEl) author = String(authorEl.text || "").trim()

                let tagEls = doc.querySelectorAll("div.addtags a.tagshow")
                for (let i = 0; i < tagEls.length; i++) {
                    let t = String(tagEls[i].text || "").trim()
                    if (t) tags.push(t)
                }

                let coverImg = doc.querySelector("div.uwthumb img")
                if (coverImg) {
                    let src = String(coverImg.attributes["src"] || "").trim()
                    if (src.startsWith("//")) cover = "https:" + src
                    else if (src.startsWith("/")) cover = this.base + src
                    else cover = src
                }

                let descEl = doc.querySelector("div.asTBcell p")
                if (descEl) {
                    description = String(descEl.innerHTML || "")
                        .replace(/<br\s*\/?>/gi, "\n")
                        .replace(/<[^>]+>/g, "")
                        .trim()
                }

                // 状态：`div.uwconn label` 里含「狀態」
                let connEls = doc.querySelectorAll("div.uwconn")
                for (let i = 0; i < connEls.length; i++) {
                    let text = String(connEls[i].text || "")
                    if (text.indexOf("狀態") !== -1 || text.indexOf("状态") !== -1) {
                        status = text.indexOf("連載中") !== -1 || text.indexOf("连载中") !== -1 ? 0 : 1
                        break
                    }
                }

                // 章节：`div.sr_compact a.tagshow[data-chid]`
                let chapterEls = doc.querySelectorAll("div.sr_compact a.tagshow")
                for (let i = 0; i < chapterEls.length; i++) {
                    let chid = String(chapterEls[i].attributes["data-chid"] || "").trim()
                    if (!chid) continue
                    chapters[chid] = String(chapterEls[i].text || "").trim() || chid
                }

                // 章节列表分页：补齐其它页
                let lastPage = 1
                let pageLinks = doc.querySelectorAll("div.f_left.paginator a")
                for (let i = 0; i < pageLinks.length; i++) {
                    let href = String(pageLinks[i].attributes["href"] || "")
                    let m = href.match(/photos-index-aid-\d+-page-(\d+)\.html/)
                    if (m) {
                        let n = parseInt(m[1], 10)
                        if (n > lastPage) lastPage = n
                    }
                }
                doc.dispose()
                doc = null

                if (lastPage > 1) {
                    let limit = Math.min(lastPage, 20)
                    for (let p = 2; p <= limit; p++) {
                        let pageBody = await this.fetchBody(
                            "chapters",
                            this.base + "/photos-index-aid-" + id + "-page-" + p + ".html"
                        )
                        let pageDoc = new HtmlDocument(pageBody)
                        try {
                            let els = pageDoc.querySelectorAll("div.sr_compact a.tagshow")
                            for (let i = 0; i < els.length; i++) {
                                let chid = String(els[i].attributes["data-chid"] || "").trim()
                                if (!chid || chapters[chid]) continue
                                chapters[chid] = String(els[i].text || "").trim() || chid
                            }
                        } finally {
                            pageDoc.dispose()
                        }
                    }
                }
            } finally {
                if (doc) doc.dispose()
            }

            if (!Object.keys(chapters).length) {
                // 无章节时按整本一章处理（部分相册只有一话）
                chapters[id] = "全一话"
            }
            // 站点按新→旧排列，阅读顺序需要反过来
            let reversed = {}
            let keys = Object.keys(chapters)
            for (let i = keys.length - 1; i >= 0; i--) {
                reversed[keys[i]] = chapters[keys[i]]
            }

            let tagMap = {}
            if (author) tagMap["作者"] = [author]
            if (status === 0) tagMap["状态"] = ["连载中"]
            else tagMap["状态"] = ["已完结"]
            if (tags.length) tagMap["标签"] = tags

            return new ComicDetails({
                id: String(id),
                title: title,
                cover: cover,
                description: description,
                tags: tagMap,
                chapters: reversed,
            })
        },

        loadEp: async (comicId, epId) => {
            // 章节页是 photos-gallery-aid-<chid>.html（index → gallery）
            let url = this.base + "/photos-gallery-aid-" + epId + ".html"
            let body = await this.fetchBody("gallery", url)
            let images = []

            // 页面把图片清单写成 JS 数组：
            //   var imglist = [{ url: fast_img_host+"//img5.../i-000.jpg?verify=..", caption: "[i-000]"}, ...]
            // 第一项是 [cover]，不是正文页，必须排除。
            let itemRe = /\{\s*url:\s*fast_img_host\s*\+\s*"([^"]+)"\s*,\s*caption:\s*"([^"]*)"\s*\}/g
            let m
            while ((m = itemRe.exec(body)) !== null) {
                let u = String(m[1] || "").trim()
                let caption = String(m[2] || "")
                if (!u || caption.indexOf("[cover]") !== -1) continue
                if (u.startsWith("//")) u = "https:" + u
                if (images.indexOf(u) === -1) images.push(u)
            }

            // 兜底：直接从 HTML 里扫图片地址（排除封面）
            if (!images.length) {
                let re = /\/\/[^\s"'\\]+\.(?:jpeg|jpg|png|webp|gif)(?:\?[^\s"'\\]*)?/gi
                while ((m = re.exec(body)) !== null) {
                    let u = "https:" + m[0]
                    if (/\/cover\.[a-z]+/i.test(u)) continue
                    if (images.indexOf(u) === -1) images.push(u)
                }
            }

            if (!images.length) throw "未解析到图片"
            return { images: images }
        },

        onImageLoad: (url) => {
            let headers = this.headers()
            headers["Referer"] = this.base + "/"
            return { url: url, headers: headers }
        },

        onThumbnailLoad: (url) => {
            let headers = this.headers()
            headers["Referer"] = this.base + "/"
            return { url: url, headers: headers }
        },
    }

    settings = {
        base_url: {
            title: "站点地址",
            type: "input",
            validator: "^https?://.+$",
            default: WNACG.defaultBaseUrl,
        },
    }
}
