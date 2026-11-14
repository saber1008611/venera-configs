class JM extends ComicSource {
    // Note: The fields which are marked as [Optional] should be removed if not used

    // name of the source
    name = "禁漫天堂"

    // unique id of the source
    key = "jm"

    version = "1.4.5"

    minAppVersion = "1.5.0"

    static jmVersion = "2.0.16"

    static jmPkgName = "com.example.app"

    // update url
    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/jm.js"

    dailyCheckInInProgress = false

    // 官方域名表（newsvr-2025.txt）里当前在用的 API 线路。
    // 顺序按实测可用性排：cdnbtd / cdngwc.club 在这台机器上会超时，
    // 放在后面，先试能通的，避免首次请求就等满超时。
    static apiDomains = [
        "www.cdngwc.net",
        "www.cdnutc.cc",
        "www.cdngwc.club",
        "www.cdnbtd.cc",
    ]

    // 取不到官方域名表时的兜底线路。旧域名 cdntwice / cdnsha / cdnaspa 已被墙或
    // 源站下线（实测 522 / RST），2026-11 起官方换成了下面这几台。
    static fallbackServers = [
        "www.cdngwc.net",
        "www.cdnutc.cc",
        "www.cdngwc.club",
        "www.cdnbtd.cc",
    ];

    static imageUrl = "https://cdn-msp.jmapinodeudzn.net"

    // 默认走「自动」：shunt 0 是服务端自己的自动档。上游默认值 1 固定指向
    // tencent 那台，实测是所有线路里最慢的一档（165KB/s，快的有 400KB/s）。
    static defaultImgStream = "0"

    static ua = "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36"

    // 单次请求超时（毫秒）。线路半死不活时不要让界面卡几十秒。
    // 单次线路请求的上限（毫秒）。不能太小：TCP 被静默丢弃时，客户端要先等
    // connectTimeout（5s）失败才会回退到 HTTP/3，QUIC 握手实测 0.5–5s，两者相加
    // 最坏 10s。原来设 12s 时余量不足，回退还没完成 JS 侧就先报"请求超时"。
    static requestTimeoutMs = 20000

    // 某台线路失败后，冷却多久不再尝试（毫秒）。
    static hostCooldownMs = 5 * 60 * 1000

    get ua() {
        return JM.ua;
    }

    /// 当前使用的 API 域名（记住上次可用的那一台）。
    get baseHost() {
        let saved = this.loadData('_api_host')
        if (saved && JM.apiDomains.includes(saved)) return saved
        let index = parseInt(this.loadSetting('apiDomain')) - 1
        let configured = JM.apiDomains[index]
        if (configured) return configured
        return JM.apiDomains[0]
    }

    get baseUrl() {
        return `https://${this.baseHost}`
    }

    /// 依次尝试的线路：当前 > 官方表 > 兜底表（去重、最多 4 个）。
    candidateHosts() {
        let list = [this.baseHost]
        for (let host of JM.apiDomains) if (!list.includes(host)) list.push(host)
        for (let host of JM.fallbackServers) if (!list.includes(host)) list.push(host)
        return list.slice(0, 4)
    }

    overwriteApiDomains(domains) {
        if (domains.length != 0) JM.apiDomains = domains
    }

    overwriteImgUrl(url) {
        if (url.length != 0) JM.imageUrl = url
    }

    /// 把图片地址里旧的图片线路改写成当前选中的线路。
    ///
    /// 服务端每次下发的 host 会轮换，而已经写进阅读记录/缓存的图片地址会一直
    /// 指向当时那台（可能是最慢的 tencent）。切换到更快的线路后，这些旧地址
    /// 也应该跟着换，否则老章节还是慢。
    rewriteImgHost(url) {
        if (typeof url !== 'string') return url
        let m = /^https?:\/\/[^\/]+/.exec(url)
        if (!m) return url
        let origin = m[0]
        if (origin === JM.imageUrl) return url
        let bare = origin.replace(/^https?:\/\//, '')
        let known = [
            "jmdanjonproxy.xyz",
            "jmdanjonproxy.vip",
            "jmdanjonproxy.top",
            "jmapiproxy1.cc",
            "jmapiproxy2.cc",
            "jmapiproxy3.cc",
            "jmapinodeudzn.net",
        ]
        for (let suffix of known) {
            if (bare.endsWith(suffix)) {
                return JM.imageUrl + url.substring(origin.length)
            }
        }
        return url
    }

    isNum(str) {
        return /^\d+$/.test(str)
    }

    get baseHeaders() {
        return {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": "keep-alive",
            "Origin": "https://localhost",
            "Referer": "https://localhost/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site",
            "X-Requested-With": JM.jmPkgName,
        }
    }

    getApiHeaders(time) {
        if (this.loadSetting("dailyCheckInTask")) {
            this.dailyCheckIn(true)
        }
        const jmAuthKey = "18comicAPPContent"
        let token = Convert.md5(Convert.encodeUtf8(`${time}${jmAuthKey}`))

        return {
            ...this.baseHeaders,
            "Authorization": "Bearer",
            "Sec-Fetch-Storage-Access": "active",
            "token": Convert.hexEncode(token),
            "tokenparam": `${time},${JM.jmVersion}`,
            "User-Agent": this.ua,
        }
    }

    getImgHeaders() {
        return {
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": "keep-alive",
            "Referer": "https://localhost/",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Storage-Access": "active",
            "User-Agent": this.ua,
            "X-Requested-With": JM.jmPkgName,
        }
    }

    /// 测速样本大小（字节）。每台线路只抓头 256KB，够看出快慢了。
    static imgProbeBytes = 256 * 1024

    /// 「自动」测速结果缓存多久（毫秒）。服务端线路会轮换，但不必每章都测。
    static imgHostCacheTtlMs = 6 * 60 * 60 * 1000

    /// 服务端当前可能下发的图片线路：问 shunt 0..4，去重后加上当前线路。
    async candidateImgHosts() {
        let hosts = [JM.imageUrl]
        let list = await Promise.all(
            [0, 1, 2, 3, 4].map(async (shunt) => {
                try {
                    let res = JSON.parse(
                        await this.get(
                            `${this.baseUrl}/setting?app_img_shunt=${shunt}&express=`
                        )
                    )
                    return res["img_host"] ?? null
                } catch (e) {
                    return null
                }
            })
        )
        for (let host of list) {
            if (host && hosts.indexOf(host) < 0) hosts.push(host)
        }
        return hosts
    }

    /// 并发下载同一张图的头部，取速度最快的一台；全都失败返回 null。
    async fastestImgHost(hosts, epId, sampleName) {
        let path = `/media/photos/${epId}/${sampleName}`
        let headers = this.getImgHeaders()
        headers["Range"] = `bytes=0-${JM.imgProbeBytes - 1}`
        // 测速不是真的要看图，别让网络缓存把数据留下来。
        headers["cache-time"] = "no"
        let results = await Promise.all(
            hosts.map(async (host) => {
                let start = Date.now()
                try {
                    let res = await Network.fetchBytes(
                        "GET", host + path, headers, undefined,
                        { allowHttp3Fallback: true }
                    )
                    let size = res.body ? res.body.byteLength : 0
                    let ms = Date.now() - start
                    if (!size) return null
                    return { host: host, speed: size / Math.max(ms, 1) }
                } catch (e) {
                    return null
                }
            })
        )
        let best = null
        let bestSpeed = 0
        for (let r of results) {
            if (r && r.speed > bestSpeed) {
                bestSpeed = r.speed
                best = r.host
            }
        }
        return best
    }

    /**
     * 「自动」图片线路：拿本话第一张图做样本，量各线路实际速度选最快的一台。
     *
     * 不能固定用某个 shunt：同一个编号每次下发的主机都不一样（shunt 0 有时给
     * cdn-msp.jmdanjonproxy.xyz，有时给最慢的 jmapiproxy3.cc），只能实测。
     * 结果缓存 6 小时，避免每章都测。
     */
    async autoPickImgHost(epId, images) {
        if (!images || images.length === 0) return
        let cached = this.loadData('_img_host')
        let at = Number(this.loadData('_img_host_at') ?? 0)
        if (typeof cached === 'string' && cached.length !== 0 && at !== 0 &&
            Date.now() - at < JM.imgHostCacheTtlMs) {
            this.overwriteImgUrl(cached)
            return
        }
        try {
            let hosts = await this.candidateImgHosts()
            let best = await this.fastestImgHost(hosts, epId, images[0])
            if (best === null) return
            this.overwriteImgUrl(best)
            this.saveData('_img_host', best)
            this.saveData('_img_host_at', Date.now())
        } catch (e) {
            // 测速失败就继续用当前线路，不影响阅读
        }
    }

    getCoverUrl(id) {
        // imageUrl 是静态字段，实例上的 this.imageUrl 是 undefined；封面和正片
        // 图片都从这里拼地址，写错的话整站图片都会变成「undefined/media/...」。
        return `${JM.imageUrl}/media/albums/${id}_3x4.jpg`
    }

    /// 当前图片线路。供 `comic` 里的钩子使用：那些箭头函数在字段初始化时创建，
    /// 作用域里拿不到类名 JM（实测 `typeof JM === "undefined"`），只能走实例方法。
    currentImgUrl() {
        return JM.imageUrl
    }

    getImageUrl(id, imageName) {
        return `${JM.imageUrl}/media/photos/${id}/${imageName}`
    }

    getAvatarUrl(imageName) {
        return `${JM.imageUrl}/media/users/${imageName}`
    }

    async init() {
        if (this.loadSetting('refreshDomainsOnStart')) await this.refreshApiDomains(false)
        this.refreshImgUrl(false)
    }

    /**
     *
     * @param showConfirmDialog {boolean}
     */
    async refreshApiDomains(showConfirmDialog) {
        let url = "https://rup4a04-c02.tos-cn-hongkong.bytepluses.com/newsvr-2025.txt"
        let domainSecret = "diosfjckwpqpdfjkvnqQjsik"
        let title = ""
        let message = ""
        let servers = []
        let domains = []
        let res = null;
        try {
            res = await fetch(url, { headers: this.baseHeaders });
        } catch (error) {
            res = null;
        }
        if (res && res.status === 200) {
            let data = this.convertData(await res.text(), domainSecret)
            let json = JSON.parse(data)
            if (json["Server"]) {
                title = "Update Success"
                message = "\n"
                servers = json["Server"].slice(0, 4)
            }
        }
        if (servers.length === 0) {
            title = "Update Failed"
            message = `Using built-in domains:\n\n`
            servers = JM.fallbackServers
        }
        for (let i = 0; i < servers.length; i++) {
            message = message + `線路${i + 1}:  ${servers[i]}\n\n`
            domains.push(servers[i])
        }
        if (showConfirmDialog) {
            UI.showDialog(
                title,
                message,
                [
                    {
                        text: "Cancel",
                        callback: () => {}
                    },
                    {
                        text: "Apply",
                        callback: () => {
                            this.overwriteApiDomains(domains)
                            this.refreshImgUrl(true)
                        }
                    }
                ]
            )
        } else {
            this.overwriteApiDomains(domains)
        }
    }

    /**
     * 选择图片线路。
     *
     * 用本机 HTTP 栈（AppDio + rhttp + HTTP/3 回退）对同一张图实测各线路下载
     * 速度（2026-11，Windows，两轮，单图 556KB）：
     *   cdn-msp12.jmdanjonproxy.xyz     281 / 401 KB/s
     *   cdn-msp3.jmdanjonproxy.vip      339 / 265 KB/s
     *   cdn-msp.jmdanjonproxy.xyz       275 / 276 KB/s
     *   cdn-msp.jmapiproxy1.cc          255 / 134 KB/s
     *   cdn-msp.jmapinodeudzn.net       202 / 172 KB/s
     *   tencent.jmdanjonproxy.xyz       163 / 165 KB/s  ← 上游默认值 1 就是这台
     *   cdn-msp2.jmapiproxy3.cc          78 / 133 KB/s
     * 服务端每次下发的 host 都会轮换，编号和 host 不能硬编码绑定，所以「自动」
     * 直接用官方的 shunt 0（服务端自己的自动档）——实测它下发的都是上面较快
     * 的几台；而默认值 1 固定是 tencent 那台最慢的。
     *
     * @param showMessage {boolean}
     */
    async refreshImgUrl(showMessage) {
        let choice = this.loadSetting('imageStream')
        if (choice === undefined || choice === null || choice === '') {
            choice = JM.defaultImgStream
        }
        let res = await this.get(
            `${this.baseUrl}/setting?app_img_shunt=${choice}&express=`
        )
        let setting = JSON.parse(res)
        let host = setting["img_host"] ?? null
        if (host === null || host.length === 0) return
        this.saveData('_img_host', host)
        if (showMessage) UI.showMessage(`图片线路:\n${host}`)
        this.overwriteImgUrl(host)
    }

    /**
     *
     * @param comic {object}
     * @returns {Comic}
     */
    parseComic(comic) {
        let id = comic.id.toString()
        let author = comic.author
        let title = comic.name
        let description = comic.description ?? ""
        let cover = this.getCoverUrl(id)
        let tags =[]
        if(comic["category"]["title"]) {
            tags.push(comic["category"]["title"])
        }
        if(comic["category_sub"]["title"]) {
            tags.push(comic["category_sub"]["title"])
        }
        return new Comic({
            id: id,
            title: title,
            subTitle: author,
            cover: cover,
            tags: tags,
            description: description
        })
    }

    /**
     *
     * @param input {string}
     * @param secret {string}
     * @returns {string}
     */
    convertData(input, secret) {  
        let key = Convert.encodeUtf8(Convert.hexEncode(Convert.md5(Convert.encodeUtf8(secret))))
        let data = Convert.decodeBase64(input)
        let decrypted = Convert.decryptAesEcb(data, key)
        let res = Convert.decodeUtf8(decrypted)
        let start = 0
        while (start < res.length && res[start] !== '{' && res[start] !== '[') {
            start++
        }
        let end = res.length - 1
        while(end > start && res[end] !== '}' && res[end] !== ']') {
            end--
        }
        return res.substring(start, end + 1)
    }

    /**
     *
     * @param url {string}
     * @returns {Promise<string>}
     */
    async get(url) {
        let result = await this.requestWithFailover(url, "GET", null)
        return this.decodeResponse(result.res, result.time)
    }

    async post(url, body) {
        let result = await this.requestWithFailover(url, "POST", body)
        return this.decodeResponse(result.res, result.time)
    }

    /// 站点换域名很频繁：网络错误 / 5xx 时自动换下一台线路，并记住能用的那台。
    /// 死掉的线路会记一段时间（默认 5 分钟）不再尝试，避免每次操作都卡在超时上。
    async requestWithFailover(url, method, body) {
        let hosts = this.aliveHosts()
        let lastError = null
        for (let host of hosts) {
            let target = url.replace(/^https:\/\/[^/]+/, `https://${host}`)
            let time = Math.floor(Date.now() / 1000)
            try {
                let res = await this.withTimeout(
                    method === "POST"
                        ? Network.post(target, {
                            ...this.getApiHeaders(time),
                            "Content-Type": "application/x-www-form-urlencoded"
                        }, body)
                        : Network.get(target, this.getApiHeaders(time)),
                    JM.requestTimeoutMs,
                    "请求"
                )
                if (res.status === 200 || res.status === 401) {
                    this.clearHostFailure(host)
                    if (host !== this.baseHost) this.saveData('_api_host', host)
                    return { res: res, time: time }
                }
                if (res.status < 500) {
                    this.clearHostFailure(host)
                    return { res: res, time: time }
                }
                this.markHostFailed(host)
                lastError = 'Invalid Status Code: ' + res.status
            } catch (e) {
                this.markHostFailed(host)
                lastError = String(e && e.message ? e.message : e)
            }
        }
        throw lastError ?? 'All API domains failed'
    }

    /// 给请求套一层超时，避免某台线路半死不活时把界面卡住几十秒。
    async withTimeout(promise, ms, label) {
        let timer = new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error(`${label || '请求'}超时`)), ms)
        })
        return await Promise.race([promise, timer])
    }

    hostFailures() {
        let raw = this.loadData('_host_failures')
        if (!raw) return {}
        try {
            let parsed = JSON.parse(raw)
            return parsed && typeof parsed === 'object' ? parsed : {}
        } catch (e) {
            return {}
        }
    }

    markHostFailed(host) {
        let failures = this.hostFailures()
        failures[host] = Date.now() + JM.hostCooldownMs
        this.saveData('_host_failures', JSON.stringify(failures))
    }

    clearHostFailure(host) {
        let failures = this.hostFailures()
        if (failures[host] === undefined) return
        delete failures[host]
        this.saveData('_host_failures', JSON.stringify(failures))
    }

    /// 可用线路：当前线路优先，然后官方表与兜底表里没被标记失败的；
    /// 全部都被标记失败时退回完整列表（可能是冷却期判断错了）。
    aliveHosts() {
        let failures = this.hostFailures()
        let now = Date.now()
        let all = this.candidateHosts()
        let alive = all.filter(host => {
            let until = failures[host]
            return until === undefined || until <= now
        })
        return alive.length > 0 ? alive : all
    }

    decodeResponse(res, time) {
        let kJmSecret = "185Hcomic3PAPP7R"
        if(res.status !== 200) {
            if(res.status === 401) {
                let json = JSON.parse(res.body)
                let message = json.errorMsg
                if(message === "請先登入會員" && this.isLogged) {
                    throw 'Login expired'
                }
                throw message ?? 'Invalid Status Code: ' + res.status
            }
            throw 'Invalid Status Code: ' + res.status
        }
        let json = JSON.parse(res.body)
        let data = json.data
        if(typeof data !== 'string') {
            throw 'Invalid Data'
        }
        return this.convertData(data, `${time}${kJmSecret}`)
    }

    async dailyCheckIn(isTask = false) {
        if (this.dailyCheckInInProgress) return
        this.dailyCheckInInProgress = true
        const throwError = (msg) => {
            UI.showMessage(msg)
            throw msg
        }
        try {
            const lastCheckInDate = this.loadData("lastCheckInDate")
            const today = new Date().toLocaleDateString('zh-CN')
            if (lastCheckInDate && lastCheckInDate === today) {
                if (isTask) return
                throwError("Already checked in today")
            }
            if (!this.isLogged) {
                if (isTask) return
                throwError("Please login to check-in")
            }
            const uid = this.loadData("uid")
            if (!uid) {
                throwError("Invalid uid, please login again")
            }
            const checkRecordRes = await this.get(`${this.baseUrl}/daily?user_id=${uid}`)
            const checkRecord = JSON.parse(checkRecordRes)
            if (!('daily_id' in checkRecord)) {
                throwError("Invalid daily_id, check-in failed")
            }
            const daily_id = checkRecord.daily_id
            const checkResultRes = await this.post(`${this.baseUrl}/daily_chk`, `user_id=${uid}&daily_id=${daily_id}`)
            const checkResult = JSON.parse(checkResultRes)
            if (!checkResult.msg) {
                throwError("Invalid check-in result, check-in failed")
            }
            UI.showMessage(checkResult.msg)
            this.saveData("lastCheckInDate", today)
        } finally {
            this.dailyCheckInInProgress = false
        }
    }

    // [Optional] account related
    account = {
        /**
         * [Optional] login with account and password, return any value to indicate success
         * @param account {string}
         * @param pwd {string}
         * @returns {Promise<any>}
         */
        login: async (account, pwd) => {
            let time = Math.floor(Date.now() / 1000)
            let res = await this.post(
                `${this.baseUrl}/login`,
                `username=${encodeURIComponent(account)}&password=${encodeURIComponent(pwd)}`
            )
            let json = JSON.parse(res)
            if (json.uid) {
                this.saveData("uid", json.uid)
            }
            return "ok"
        },

        /**
         * logout function, clear account related data
         */
        logout: () => {
            for (let url of JM.apiDomains) {
                Network.deleteCookies(url)
            }
        },

        // {string?} - register url
        registerWebsite: null
    }

    // explore page list
    explore = [
        {
            title: "禁漫天堂",
            type: "multiPageComicList",
            optionList: [
                {
                    label: "分类",
                    type: "select",
                    options: [
                        "0-最新A漫",
                        "doujin-同人",
                        "single-單本",
                        "short-短篇",
                        "another-其他類",
                        "hanman-韓漫",
                        "meiman-美漫",
                        "another_cosplay-Cosplay",
                        "3D-3D",
                        "禁漫漢化組-禁漫漢化組",
                    ],
                },
                {
                    label: "排序",
                    type: "select",
                    options: [
                        "mr-最新",
                        "mv-總排行",
                        "mv_m-月排行",
                        "mv_w-周排行",
                        "mv_t-日排行",
                        "mp-最多圖片",
                        "tf-最多喜歡",
                    ],
                },
            ],
            load: async (page, options) => {
                options = options || []
                let cate = options[0] || "0"
                let sort = options[1] || "mr"
                let res = await this.get(
                    `${this.baseUrl}/categories/filter?o=${sort}&c=${encodeURIComponent(cate)}&page=${page}`
                )
                let data = JSON.parse(res)
                let total = data.total
                let maxPage = Math.ceil(total / 80)
                let comics = data.content.map((e) => this.parseComic(e))
                return {
                    comics: comics,
                    maxPage: maxPage
                }
            },
        }
    ]

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "禁漫天堂",
        parts: [
            {
                name: "每週必看",
                type: "fixed",
                categories: ["每週必看"],
                itemType: "category",
            },
            {
                name: "成人A漫",
                type: "fixed",
                categories: ["最新A漫", "同人", "單本", "短篇", "其他類", "韓漫", "美漫", "Cosplay", "3D", "禁漫漢化組"],
                itemType: "category",
                categoryParams: [
                    "0",
                    "doujin",
                    "single",
                    "short",
                    "another",
                    "hanman",
                    "meiman",
                    "another_cosplay",
                    "3D",
                    "禁漫漢化組"
                ],
            },
            {
                name: "主題A漫",
                type: "fixed",
                categories: [
                    '無修正',
                    '劇情向',
                    '青年漫',
                    '校服',
                    '純愛',
                    '人妻',
                    '教師',
                    '百合',
                    'Yaoi',
                    '性轉',
                    'NTR',
                    '女裝',
                    '癡女',
                    '全彩',
                    '女性向',
                    '完結',
                    '純愛',
                    '禁漫漢化組'
                ],
                itemType: "search",
            },
            {
                name: "角色扮演",
                type: "fixed",
                categories: [
                    '御姐',
                    '熟女',
                    '巨乳',
                    '貧乳',
                    '女性支配',
                    '教師',
                    '女僕',
                    '護士',
                    '泳裝',
                    '眼鏡',
                    '連褲襪',
                    '其他制服',
                    '兔女郎'
                ],
                itemType: "search",
            },
            {
                name: "特殊PLAY",
                type: "fixed",
                categories: [
                    '群交',
                    '足交',
                    '束縛',
                    '肛交',
                    '阿黑顏',
                    '藥物',
                    '扶他',
                    '調教',
                    '野外露出',
                    '催眠',
                    '自慰',
                    '觸手',
                    '獸交',
                    '亞人',
                    '怪物女孩',
                    '皮物',
                    'ryona',
                    '騎大車'
                ],
                itemType: "search",
            },
            {
                name: "特殊PLAY",
                type: "fixed",
                categories: ['CG', '重口', '獵奇', '非H', '血腥暴力', '站長推薦'],
                itemType: "search",
            },
        ],
        // enable ranking page
        enableRankingPage: true,
    }

    /// category comic loading related
    categoryComics = {
        /**
         * load comics of a category
         * @param category {string} - category name
         * @param param {string?} - category param
         * @param options {string[]} - options from optionList
         * @param page {number} - page number
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (category, param, options, page) => {
            if (category !== "每週必看") {
                param ??= category
                param = encodeURIComponent(param)
                let res = await this.get(`${this.baseUrl}/categories/filter?o=${options[0]}&c=${param}&page=${page}`)
                let data = JSON.parse(res)
                let total = data.total
                let maxPage = Math.ceil(total / 80)
                let comics = data.content.map((e) => this.parseComic(e))
                return {
                    comics: comics,
                    maxPage: maxPage
                }
            } else {
                let res = await this.get(`${this.baseUrl}/week/filter?id=${options[0]}&type=${options[1]}&page=0`)
                let data = JSON.parse(res)
                let comics = data.list.map((e) => this.parseComic(e))
                return {
                    comics: comics,
                    maxPage: 1
                }
            }
        },
        /**
         * [Optional] load options dynamically. If `optionList` is provided, this will be ignored.
         * @param category {string}
         * @param param {string?}
         * @return {Promise<{options: string[], label?: string}[]>} - return a list of option group, each group contains a list of options
         */
        optionLoader: async (category, param) => {
            if (category !== "每週必看") {
                return [
                    {
                        label: "排序",
                        // For a single option, use `-` to separate the value and text, left for value, right for text
                        options: [
                            "mr-最新",
                            "mv-總排行",
                            "mv_m-月排行",
                            "mv_w-周排行",
                            "mv_t-日排行",
                            "mp-最多圖片",
                            "tf-最多喜歡",
                        ],
                    }
                ]
            } else {
                let res = await this.get(`${this.baseUrl}/week`)
                let data = JSON.parse(res)
                let options = []
                for (let e of data["categories"]) {
                    options.push(`${e["id"]}-${e["time"]}`)
                }
                return [
                    {
                        label: "時間",
                        options: options,
                    },
                    {
                        label: "類型",
                        options: [
                          "manga-日漫",
                          "hanman-韓漫",
                          "another-其他",
                        ]
                    }
                ]
            }
        },
        ranking: {
            // For a single option, use `-` to separate the value and text, left for value, right for text
            options: [
                "mv-總排行",
                "mv_m-月排行",
                "mv_w-周排行",
                "mv_t-日排行",
            ],
            /**
             * load ranking comics
             * @param option {string} - option from optionList
             * @param page {number} - page number
             * @returns {Promise<{comics: Comic[], maxPage: number}>}
             */
            load: async (option, page) => {
                return this.categoryComics.load("總排行", "0", [option], page)
            }
        }
    }

    /// search related
    search = {
        /**
         * load search result
         * @param keyword {string}
         * @param options {(string | null)[]} - options from optionList
         * @param page {number}
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (keyword, options, page) => {
            keyword = keyword.trim()
            keyword = encodeURIComponent(keyword)
            keyword = keyword.replace(/%20/g, '+')
            let url = `${this.baseUrl}/search?search_query=${keyword}&o=${options[0]}`
            if(page > 1) {
                url += `&page=${page}`
            }
            let res = await this.get(url)
            let data = JSON.parse(res)
            let total = data.total
            let maxPage = Math.ceil(total / 80)
            let comics = data.content.map((e) => this.parseComic(e))
            return {
                comics: comics,
                maxPage: maxPage
            }
        },

        // provide options for search
        optionList: [
            {
                type: "select",
                // For a single option, use `-` to separate the value and text, left for value, right for text
                options: [
                    "mr-最新",
                    "mv-總排行",
                    "mv_m-月排行",
                    "mv_w-周排行",
                    "mv_t-日排行",
                    "mp-最多圖片",
                    "tf-最多喜歡",
                ],
                // option label
                label: "排序",
            }
        ],
    }

    // favorite related
    favorites = {
        multiFolder: true,
        /**
         * add or delete favorite.
         * throw `Login expired` to indicate login expired, App will automatically re-login and re-add/delete favorite
         * @param comicId {string}
         * @param folderId {string}
         * @param isAdding {boolean} - true for add, false for delete
         * @param favoriteId {string?} - [Comic.favoriteId]
         * @returns {Promise<any>} - return any value to indicate success
         */
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            if (isAdding) {
                await this.post(`${this.baseUrl}/favorite`, `aid=${comicId}`)
                await this.post(`${this.baseUrl}/favorite_folder`, `type=move&folder_id=${folderId}&aid=${comicId}`)
            } else {
                await this.post(`${this.baseUrl}/favorite`, `aid=${comicId}`)
            }
        },
        /**
         * load favorite folders.
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * if comicId is not null, return favorite folders which contains the comic.
         * @param comicId {string?}
         * @returns {Promise<{folders: {[p: string]: string}, favorited: string[]}>} - `folders` is a map of folder id to folder name, `favorited` is a list of folder id which contains the comic
         */
        loadFolders: async (comicId) => {
            let res = await this.get(`${this.baseUrl}/favorite`)
            let folders = {
                "0": this.translate("All")
            }
            let json = JSON.parse(res)
            for (let e of json.folder_list) {
                folders[e.FID.toString()] = e.name
            }
            return {
                folders: folders,
                favorited: []
            }
        },
        /**
         * add a folder
         * @param name {string}
         * @returns {Promise<any>} - return any value to indicate success
         */
        addFolder: async (name) => {
            await this.post(`${this.baseUrl}/favorite_folder`, `type=add&folder_name=${name}`)
        },
        /**
         * delete a folder
         * @param folderId {string}
         * @returns {Promise<void>} - return any value to indicate success
         */
        deleteFolder: async (folderId) => {
            await this.post(`${this.baseUrl}/favorite_folder`, `type=del&folder_id=${folderId}`)
        },
        /**
         * load comics in a folder
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * @param page {number}
         * @param folder {string?} - folder id, null for non-multi-folder
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        loadComics: async (page, folder) => {
            let order = this.loadSetting('favoriteOrder')
            let res = await this.get(`${this.baseUrl}/favorite?folder_id=${folder}&page=${page}&o=${order}`)
            let json = JSON.parse(res)
            let total = json.total
            let maxPage = Math.ceil(total / 20)
            let comics = json.list.map((e) => this.parseComic(e))
            return {
                comics: comics,
                maxPage: maxPage
            }
        },
        singleFolderForSingleComic: true,
    }

    /// single comic related
    comic = {
        /**
         * load comic info
         * @param id {string}
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            if (id.startsWith('jm')) {
                id = id.substring(2)
            }
            let res = await this.get(`${this.baseUrl}/album?id=${id}`);
            let data = JSON.parse(res)
            let author = data.author ?? []
            let works = data.works ?? []
            let actors = data.actors ?? []
            let chapters = new Map()
            let series = (data.series ?? []).sort((a, b) => a.sort - b.sort)
            for(let e of series) {
                let title = e.name ?? ''
                title = title.trim()
                if(title.length === 0) {
                    title = `第${e["sort"]}話`
                }
                let id = e.id.toString()
                chapters.set(id, title)
            }
            if(chapters.size === 0) {
                chapters.set(id, '第1話')
            }
            let tags = data.tags ?? []
            let related = data["related_list"].map((e) => new Comic({
                id: e.id.toString(),
                title: e.name,
                subtitle: e.author ?? "",
                cover: this.getCoverUrl(e.id),
                description: e.description ?? ""
            }))
            let updateTimeStamp = data["addtime"];
            let date = new Date(updateTimeStamp * 1000)
            let updateDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

            return new ComicDetails({
                title: data.name,
                cover: this.getCoverUrl(id),
                description: data.description,
                likesCount: Number(data.likes),
                chapters: chapters,
                tags: {
                    "Author": author,
                    "Tag": tags,
                    "Work": works,
                    "Actor": actors,
                    "View": data.total_views ? [data.total_views] : [],
                },
                recommend: related,
                isFavorite: data.is_favorite ?? false,
                isLiked: data.liked ?? false,
                updateTime: updateDate,
            })
        },
        /**
         * load images of a chapter
         * @param comicId {string}
         * @param epId {string?}
         * @returns {Promise<{images: string[]}>}
         */
        loadEp: async (comicId, epId) => {
            let res = await this.get(`${this.baseUrl}/chapter?id=${epId}`);
            let data = JSON.parse(res)
            if (this.loadSetting('imageStream') === '0') {
                await this.autoPickImgHost(epId, data.images)
            }
            let images = data.images.map((e) => this.getImageUrl(epId, e))
            return {
                images: images
            }
        },
        /**
         * [Optional] provide configs for an image loading
         * @param url
         * @param comicId
         * @param epId
         * @returns {{} | Promise<{}>}
         */
        onImageLoad: (url, comicId, epId) => {
            const imageKey = url
            // Legacy keys recorded by the old `this.imageUrl` bug (see
            // onThumbnailLoad) cannot be fetched; repair before parsing.
            if (typeof url === 'string' && url.startsWith('undefined/media/')) {
                url = this.currentImgUrl() + url.substring('undefined'.length)
            }
            url = this.rewriteImgHost(url)
            const scrambleId = 220980
            let pictureName = "";
            for (let i = url.length - 1; i >= 0; i--) {
                if (url[i] === '/') {
                    pictureName = url.substring(i + 1, url.length - 5);
                    break;
                }
            }
            epId = Number(epId);
            let num = 0
            if(epId < scrambleId) {
                num = 0
            } else if (epId < 268850) {
                num = 10
            } else if (epId > 421926) {
                let str = epId.toString() + pictureName
                let bytes = Convert.encodeUtf8(str)
                let hash = Convert.md5(bytes)
                let hashStr = Convert.hexEncode(hash)
                let charCode = hashStr.charCodeAt(hashStr.length-1)
                let remainder = charCode % 8
                num = remainder * 2 + 2
            } else {
                let str = epId.toString() + pictureName
                let bytes = Convert.encodeUtf8(str)
                let hash = Convert.md5(bytes)
                let hashStr = Convert.hexEncode(hash)
                let charCode = hashStr.charCodeAt(hashStr.length-1)
                let remainder = charCode % 10
                num = remainder * 2 + 2
            }
            if (num <= 1) {
                return url === imageKey ? {} : { url: url }
            }
            return {
                headers: this.getImgHeaders(),
                // 旧记录里的图片地址可能还是慢线路，这里给出改写后的地址。
                ...(url === imageKey ? {} : { url: url }),
                // gif 图片不需要修改
                modifyImage: url.endsWith(".gif") ? null : `
                    let modifyImage = (image) => {
                        const num = ${num}
                        let blockSize = Math.floor(image.height / num)
                        let remainder = image.height % num
                        let blocks = []
                        for(let i = 0; i < num; i++) {
                            let start = i * blockSize
                            let end = start + blockSize + (i !== num - 1 ? 0 : remainder)
                            blocks.push({
                                start: start,
                                end: end
                            })
                        }
                        let res = Image.empty(image.width, image.height)
                        let y = 0
                        for(let i = blocks.length - 1; i >= 0; i--) {
                            let block = blocks[i]
                            let currentHeight = block.end - block.start
                            res.fillImageRangeAt(0, y, image, 0, block.start, image.width, currentHeight)
                            y += currentHeight
                        }
                        return res
                    }
                `,
            }
        },
        /**
         * [Optional] provide configs for a thumbnail loading
         * @param url {string}
         * @returns {{}}
         */
        onThumbnailLoad: (url) => {
            // Older versions of this source built the cover with
            // `this.imageUrl` (undefined on an instance) instead of
            // `JM.imageUrl`, so history entries recorded before that fix still
            // hold "undefined/media/albums/<id>_3x4.jpg". Those keys cannot be
            // fetched, and the reader logs one "skipped" line per row on every
            // refresh. Repair them on the way out instead of asking the user to
            // clear their history.
            if (typeof url === 'string' && url.startsWith('undefined/media/albums/')) {
                url = this.currentImgUrl() + url.substring('undefined'.length)
            }
            if (typeof url === 'string' && url.length !== 0) {
                url = this.rewriteImgHost(url)
            }
            return {
                headers: this.getImgHeaders(),
                ...(url !== undefined ? { url: url } : {}),
            }
        },
        /**
         * [Optional] like or unlike a comic
         * @param id {string}
         * @param isLike {boolean} - true for like, false for unlike
         * @returns {Promise<void>}
         */
        likeComic: async (id, isLike) => {
            let res = await this.post(`${this.baseUrl}/like`, `id=${id}`)
            let json = JSON.parse(res)
            if (json.code !== 200 || json.status === 'error') {
                throw json.msg ?? 'Failed to like/unlike comic'
            }
            return "ok"
        },
        /**
         * [Optional] load comments
         * @param comicId {string}
         * @param subId {string?} - ComicDetails.subId
         * @param page {number}
         * @param replyTo {string?} - commentId to reply, not null when reply to a comment
         * @returns {Promise<{comments: Comment[], maxPage: number?}>}
         */
        loadComments: async (comicId, subId, page, replyTo) => {
            let res = await this.get(`${this.baseUrl}/forum?mode=manhua&aid=${comicId}&page=${page}`)
            let json = JSON.parse(res)
            const pageSize = 6
            return {
                comments: json.list.map((e) => new Comment({
                    avatar: this.getAvatarUrl(e.photo),
                    userName: e.username,
                    time: e.addtime,
                    content: e.content.substring(e.content.indexOf('>') + 1, e.content.lastIndexOf('<')),
                })),
                maxPage: Math.floor(json.total / pageSize) + 1
            }
        },
        /**
         * [Optional] send a comment, return any value to indicate success
         * @param comicId {string}
         * @param subId {string?} - ComicDetails.subId
         * @param content {string}
         * @param replyTo {string?} - commentId to reply, not null when reply to a comment
         * @returns {Promise<any>}
         */
        sendComment: async (comicId, subId, content, replyTo) => {
            let res = await this.post(`${this.baseUrl}/comment`, `aid=${comicId}&comment=${encodeURIComponent(content)}&status=undefined`)
            let json = JSON.parse(res)
            if (json.status === "fail") {
                throw json.msg ?? 'Failed to send comment'
            }
            return "ok"
        },
        // {string?} - regex string, used to identify comic id from user input
        idMatch: "^(\\d+|jm\\d+)$",
        /**
         * [Optional] Handle tag click event
         * @param namespace {string}
         * @param tag {string}
         * @returns {{action: string, keyword: string, param: string?}}
         */
        onClickTag: (namespace, tag) => {
            return {
                action: 'search',
                keyword: tag,
            }
        },
    }


    /*
    [Optional] settings related
    Use this.loadSetting to load setting
    ```
    let setting1Value = this.loadSetting('setting1')
    console.log(setting1Value)
    ```
     */
    settings = {
        refreshDomains: {
            title: "Refresh Domain List",
            type: "callback",
            buttonText: "Refresh",
            callback: () => this.refreshApiDomains(true)
        },
        refreshDomainsOnStart: {
            title: "Refresh Domain List on Startup",
            type: "switch",
            default: true,
        },
        apiDomain: {
            title: "Api Domain",
            type: "select",
            options: [
                {
                    value: '1',
                },
                {
                    value: '2',
                },
                {
                    value: '3',
                },
                {
                    value: '4',
                },
            ],
            default: "1",
        },
        imageStream: {
            title: "图片线路",
            type: "select",
            options: [
                {
                    value: '0',
                    text: '自动（推荐，服务端选最快的一台）',
                },
                {
                    value: '1',
                    text: '图源1',
                },
                {
                    value: '2',
                    text: '图源2',
                },
                {
                    value: '3',
                    text: '图源3',
                },
                {
                    value: '4',
                    text: '图源4',
                },
            ],
            default: "0",
        },
        favoriteOrder: {
            title: "Favorite Order",
            type: "select",
            options: [
                {
                    value: 'mr',
                    text: 'Add Time',
                },
                {
                    value: 'mp',
                    text: 'Update Time',
                }
            ],
            default: 'mr'
        },
        dailyCheckInTask: {
            title: "Daily Check-in Task",
            type: "switch",
            default: false
        },
        dailyCheckIn: {
            title: "Manual Check-In",
            type: "callback",
            buttonText: "Check-In",
            callback: () => this.dailyCheckIn()
        },
    }

    // [Optional] translations for the strings in this config
    translation = {
        'zh_CN': {
            'Refresh Domain List': '刷新域名列表',
            'Refresh': '刷新',
            'Refresh Domain List on Startup': '启动时刷新域名列表',
            'Api Domain': 'Api域名',
            'Image Stream': '图片分流',
            'Favorite Order': '收藏夹排序',
            'Daily Check-in Task': '每日自动签到',
            'Manual Check-In': '手动签到',
            'Check-In': '签到',
            'Add Time': '添加时间',
            'Update Time': '更新时间',
            'All': '全部',
            'Author': '作者',
            'Tag': '标签',
            'Work': '作品',
            'Actor': '角色',
            'View': '浏览量',
        },
        'zh_TW': {
            'Refresh Domain List': '刷新域名列表',
            'Refresh': '刷新',
            'Refresh Domain List on Startup': '啟動時刷新域名列表',
            'Api Domain': 'Api域名',
            'Image Stream': '圖片分流',
            'Favorite Order': '收藏夾排序',
            'Daily Check-in Task': '每日自動簽到',
            'Manual Check-In': '手動簽到',
            'Check-In': '簽到',
            'Add Time': '添加時間',
            'Update Time': '更新時間',
            'All': '全部',
            'Author': '作者',
            'Tag': '標籤',
            'Work': '作品',
            'Actor': '角色',
            'View': '瀏覽量',
        },
    }
}
