/**
 * MangaDex
 *
 * 来源：venera-app/venera-configs 官方源
 *   https://github.com/venera-app/venera-configs/blob/main/manga_dex.js
 * 经 handahao666-boop/venera_comic_source 收录：
 *   https://github.com/handahao666-boop/venera_comic_source/blob/main/manga_dex.js
 * 上游仓库未随源文件附许可证声明；版权归原作者，按其发布时的用途收录。
 *
 * @type {import('./_venera_.js')}
 */
class MangaDex extends ComicSource {
    // Note: The fields which are marked as [Optional] should be removed if not used

    // name of the source
    name = "MangaDex"

    // unique id of the source
    key = "manga_dex"

    version = "1.2.0"

    minAppVersion = "1.6.0"

    // update url
    url = "https://gh-proxy.com/https://raw.githubusercontent.com/saber1008611/venera-configs/main/manga_dex.js"

    // A plain (non-browser) User-Agent is required: MangaDex's forum returns
    // "403 Bot challenge" to Chrome/Firefox-looking requests.
    static apiHeaders = {
        "User-Agent": "venera/1.0",
        "Accept": "application/json",
    }

    static async fetchApi(url, options) {
        options = options || {}
        let headers = Object.assign({}, options.headers || {}, MangaDex.apiHeaders)
        options.headers = headers
        return await fetch(url, options)
    }

    comicsPerPage = 20

    // MangaDex rejects search queries deeper than this window (Elasticsearch cap).
    maxWindow = 10000

    // The feed endpoint accepts 500 rows per request at most.
    chaptersPerPage = 500

    // Reading language. Listings only show titles that actually have readable
    // chapters in this language, and chapter lists are filtered to it, so a
    // title you can open always has something to read.
    //
    // Note: MangaDex's `availableTranslatedLanguage` index is stale for ~15% of
    // titles (measured 9/60 for `zh`), so it is used only to narrow the
    // candidate pool; every candidate is then verified against its feed.
    chapterLanguages = {
        auto: ["en", "zh", "zh-hk", "zh-tw", "ja", "ko"],
        en: ["en"],
        zh: ["zh", "zh-hk", "zh-tw"],
        ja: ["ja"],
        ko: ["ko"],
        es: ["es", "es-la"],
        pt: ["pt", "pt-br"],
        fr: ["fr"],
        ru: ["ru"],
        de: ["de"],
        it: ["it"],
        id: ["id"],
        vi: ["vi"],
        th: ["th"],
        ar: ["ar"]
    }

    languageNames = {
        en: "English",
        zh: "Chinese (Simplified)",
        "zh-hk": "Chinese (Traditional, HK)",
        "zh-tw": "Chinese (Traditional, TW)",
        ja: "Japanese",
        ko: "Korean",
        es: "Spanish",
        "es-la": "Spanish (LatAm)",
        pt: "Portuguese",
        "pt-br": "Portuguese (Brazil)",
        fr: "French",
        ru: "Russian",
        de: "German",
        it: "Italian",
        id: "Indonesian",
        vi: "Vietnamese",
        th: "Thai",
        ar: "Arabic",
        uk: "Ukrainian",
        pl: "Polish",
        tr: "Turkish"
    }

    // Preferred description language per app locale.
    descriptionLanguages = {
        zh_CN: ["zh", "zh-hk", "en", "ja"],
        zh_TW: ["zh-hk", "zh-tw", "zh", "en", "ja"],
        en_US: ["en", "ja"],
        en: ["en", "ja"]
    }

    statusNames = {
        ongoing: "Ongoing",
        completed: "Completed",
        hiatus: "Hiatus",
        cancelled: "Cancelled"
    }

    /**
     * Pick the first non-empty value from a `{ lang: text }` map following the
     * preferred language order, then fall back to whatever is available.
     */
    pickLocalized(map, preferred) {
        if (!map) return ""
        for (let lang of preferred) {
            let value = map[lang]
            if (value) return value
        }
        for (let lang of Object.keys(map)) {
            if (map[lang]) return map[lang]
        }
        return ""
    }

    /**
     * Languages the current app locale should ask MangaDex for.
     * APP.locale is `${languageCode}_${countryCode}`, e.g. `zh_CN`, `zh_TW`, `en_null`.
     */
    getPreferredLanguages() {
        let locale = (typeof APP !== "undefined" && APP.locale) ? String(APP.locale) : "en"
        if (locale.startsWith("zh_TW") || locale.startsWith("zh_HK") || locale.startsWith("zh_Hant")) {
            return ["zh-hk", "zh-tw", "zh"]
        }
        if (locale.startsWith("zh")) {
            return ["zh", "zh-hk", "zh-tw"]
        }
        let code = locale.split("_")[0]
        if (code && code !== "null" && code !== "undefined") {
            return [code]
        }
        return ["en"]
    }

    /**
     * Languages used for descriptions, ordered by preference.
     */
    getPreferredDescriptionLanguages() {
        let locale = (typeof APP !== "undefined" && APP.locale) ? String(APP.locale) : "en"
        if (this.descriptionLanguages[locale]) {
            return this.descriptionLanguages[locale]
        }
        if (locale.startsWith("zh_TW") || locale.startsWith("zh_HK")) {
            return ["zh-hk", "zh-tw", "zh", "en", "ja"]
        }
        if (locale.startsWith("zh")) {
            return ["zh", "zh-hk", "en", "ja"]
        }
        return ["en", "ja"]
    }

    /**
     * The single reading language the user picked, as MangaDex language codes.
     * Listings and chapter lists are both restricted to it: a title with no
     * readable chapters in this language is not listed at all.
     */
    getChapterLanguages() {
        let setting = this.loadSetting("chapter_language")
        if (setting === undefined || setting === null || setting === "auto") {
            return this.getPreferredLanguages()
        }
        return this.chapterLanguages[setting] ?? this.getPreferredLanguages()
    }

    /**
     * Pick the title for the current app locale, falling back to romanized
     * variants and finally to any available title.
     */
    pickTitle(titles) {
        let preferred = this.getPreferredLanguages()
        for (let lang of preferred) {
            if (titles[lang]) return titles[lang]
        }
        // Romanized / secondary forms MangaDex commonly returns.
        let locale = (typeof APP !== "undefined" && APP.locale) ? String(APP.locale) : "en"
        let extra = ["en", "ja-ro", "ko-ro", "zh-ro", "ja"]
        if (locale.startsWith("zh_TW") || locale.startsWith("zh_HK")) {
            extra = ["zh-hk", "zh-tw", "zh", "zh-ro", "en", "ja-ro", "ja"]
        } else if (locale.startsWith("zh")) {
            extra = ["zh", "zh-hk", "zh-tw", "zh-ro", "en", "ja-ro", "ja"]
        } else if (locale.startsWith("ko")) {
            extra = ["ko", "ko-ro", "en", "ja-ro", "ja"]
        } else if (locale.startsWith("ja")) {
            extra = ["ja", "ja-ro", "en"]
        }
        for (let lang of extra) {
            if (titles[lang]) return titles[lang]
        }
        for (let lang of Object.keys(titles)) {
            if (titles[lang]) return titles[lang]
        }
        return ""
    }

    /**
     * Build the query string for a manga list request, dropping empty values so
     * MangaDex never receives `foo=undefined`.
     */
    buildMangaQuery(params) {
        let parts = [
            "includes[]=cover_art",
            "includes[]=artist",
            "includes[]=author"
        ]
        for (let key of Object.keys(params)) {
            let value = params[key]
            if (value === undefined || value === null || value === "") continue
            if (Array.isArray(value)) {
                for (let item of value) {
                    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`)
                }
            } else {
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            }
        }
        return parts.join("&")
    }

    /**
     * Clamp the offset so deep pagination never trips the API's 10k window.
     */
    clampOffset(page) {
        let offset = (page - 1) * this.comicsPerPage
        if (offset > this.maxWindow - this.comicsPerPage) {
            return this.maxWindow - this.comicsPerPage
        }
        return offset
    }

    /**
     * Translate the UI filter selection into MangaDex query parameters.
     * Shared by the explore page, category browsing and search so all three
     * offer the same dimensions and can never drift apart.
     *
     * Unknown / "any" values are skipped rather than sent, because MangaDex
     * rejects unrecognised enum values with a 400.
     */
    applyCommonFilters(params, filters) {
        const orderMap = {
            popular: "followedCount",
            follows: "followedCount",
            rating: "rating",
            updated: "latestUploadedChapter",
            recent: "createdAt",
            title: "title",
            year: "year",
            relevance: "relevance"
        }
        let sort = filters.sort
        if (sort && sort !== "any") {
            let orderKey = orderMap[sort]
            if (orderKey) {
                // Title sorts ascending by nature; the rest read as "best /
                // newest first".
                params[`order[${orderKey}]`] = orderKey === "title" ? "asc" : "desc"
            }
        }

        let rating = filters.contentRating
        if (!rating || rating === "any") {
            params['contentRating[]'] = ["safe", "suggestive", "erotica"]
        } else {
            params['contentRating[]'] = rating
        }

        if (filters.status && filters.status !== "any") {
            params['status[]'] = filters.status
        }
        if (filters.demographic && filters.demographic !== "any") {
            params['publicationDemographic[]'] = filters.demographic
        }
        if (filters.originalLanguage && filters.originalLanguage !== "any") {
            // `zhHk` is the option key (the `value-text` string form cannot
            // carry a hyphen inside the value); MangaDex wants `zh-hk`.
            let lang = filters.originalLanguage === "zhHk" ? "zh-hk" : filters.originalLanguage
            params['originalLanguage[]'] = lang
        }
        if (filters.year !== undefined && filters.year !== null && String(filters.year).trim() !== "") {
            let parsed = parseInt(String(filters.year).trim())
            if (!isNaN(parsed)) {
                params['year'] = parsed
            }
        }
        if (filters.includeTags !== undefined && filters.includeTags !== null && String(filters.includeTags).trim() !== "") {
            let ids = []
            for (let raw of String(filters.includeTags).split(/[,，;；\s]+/)) {
                let name = raw.trim()
                if (!name) continue
                // Accept either a tag name or a raw MangaDex tag uuid.
                let id = this.tags[name] ||
                    this.tags[name.replaceAll('_', ' ')] ||
                    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name) ? name : undefined)
                if (id) {
                    ids.push(id)
                }
            }
            if (ids.length > 0) {
                params['includedTags[]'] = ids
            }
        }
        return params
    }

    /**
     * The filter groups shared by explore / category / search.
     * `withText` adds the free-text groups (year, tag names) on top.
     */
    commonFilterGroups(withText) {
        let groups = [
            {
                label: "Sort By",
                type: "select",
                options: [
                    "popular-Popular (follows)",
                    "rating-Rating",
                    "updated-Recently updated",
                    "recent-Recently added",
                    "title-Title A-Z",
                    "year-Year (newest)",
                ],
                default: "popular",
            },
            {
                label: "Demographic",
                type: "select",
                options: [
                    "any-Any",
                    "shounen-Shounen",
                    "shoujo-Shoujo",
                    "seinen-Seinen",
                    "josei-Josei",
                    "none-None",
                ],
                default: "any",
            },
            {
                label: "Original Language",
                type: "select",
                // NOTE: `categoryComics.optionList` only accepts `value-text`
                // strings — it calls `option.contains("-")` on every entry, so
                // an object here crashes the parser. The value is written as
                // `zhHk` (no hyphen) and mapped back to `zh-hk` when the query
                // is built, which keeps one option list usable everywhere.
                options: [
                    "any-Any",
                    "ja-Japanese",
                    "ko-Korean",
                    "zh-Chinese",
                    "zhHk-Chinese (HK)",
                    "en-English",
                    "fr-French",
                    "es-Spanish",
                    "ru-Russian",
                    "id-Indonesian",
                    "vi-Vietnamese",
                    "th-Thai",
                    "de-German",
                    "it-Italian",
                ],
                default: "any",
            },
            {
                label: "Status",
                type: "select",
                options: [
                    "any-Any",
                    "ongoing-Ongoing",
                    "completed-Completed",
                    "hiatus-Hiatus",
                    "cancelled-Cancelled",
                ],
                default: "any",
            },
            {
                label: "Content Rating",
                type: "select",
                options: [
                    "any-Any",
                    "safe-Safe",
                    "suggestive-Suggestive",
                    "erotica-Erotica",
                ],
                default: "any",
            },
        ]
        if (withText) {
            groups.push({
                label: "Year",
                type: "text",
                default: "",
            })
            groups.push({
                label: "Include Tags",
                type: "text",
                default: "",
            })
        }
        return groups
    }

    api = {
        parseComic: (data) => {
            let id = data['id']
            let titles = {}
            let mainTitles = data['attributes']['title'] || {}
            for (let lang of Object.keys(mainTitles)) {
                titles[lang] = mainTitles[lang]
            }
            for (let at of (data['attributes']['altTitles'] || [])) {
                for (let lang of Object.keys(at)) {
                    if (titles[lang] === undefined && at[lang]) {
                        titles[lang] = at[lang]
                    }
                }
            }
            let mainTitle = this.pickTitle(titles)
            let tags = []
            for (let tag of (data['attributes']['tags'] || [])) {
                let name = tag['attributes']?.['name']?.['en']
                if (name) tags.push(name)
            }
            let cover = data['relationships'].find((e) => e['type'] === 'cover_art')?.['attributes']?.['fileName']
            if (cover) {
                cover = `https://uploads.mangadex.org/covers/${id}/${cover}.256.jpg`
            } else {
                cover = ""
            }
            let description = this.pickLocalized(
                data['attributes']['description'],
                this.getPreferredDescriptionLanguages()
            )
            let createTime = data['attributes']['createdAt']
            let updateTime = data['attributes']['updatedAt']
            let status = data['attributes']['status']
            let authors = []
            let artists = []
            for (let rel of data['relationships']) {
                if (rel['type'] === 'author') {
                    let name = rel['attributes']?.['name']
                    if (name) {
                        authors.push(name)
                        this.authors[name] = rel['id']
                    }
                } else if (rel['type'] === 'artist') {
                    let name = rel['attributes']?.['name']
                    if (name) {
                        artists.push(name)
                        this.artists[name] = rel['id']
                    }
                }
            }

            return {
                id: id,
                title: mainTitle,
                subtitle: authors.length > 0 ? authors[0] : undefined,
                titles: titles,
                cover: cover,
                tags: tags,
                description: description,
                createTime: createTime,
                updateTime: updateTime,
                status: status,
                authors: authors,
                artists: artists,
            }
        },

        /**
         * Run a manga list query and normalise the result.
         *
         * Listings are restricted to the reading language: MangaDex's
         * `availableTranslatedLanguage` index narrows the candidate pool, and
         * each candidate is then verified against its feed because that index
         * is stale for roughly 15% of titles. Verification is what keeps a
         * title with zero readable chapters out of the list entirely.
         */
        loadMangaList: async (params, page) => {
            let languages = this.getChapterLanguages()
            let perPage = this.comicsPerPage
            let collected = []
            let offset = this.clampOffset(page || 1)
            let guard = 0

            while (collected.length < perPage && guard++ < 8) {
                let pageParams = Object.assign({}, params)
                pageParams['availableTranslatedLanguage[]'] = languages
                let url = `https://api.mangadex.org/manga?` +
                    `${this.buildMangaQuery(pageParams)}&limit=${perPage}`
                if (offset > 0) {
                    url += `&offset=${offset}`
                }
                let res = await MangaDex.fetchApi(url)
                if (!res.ok) {
                    throw new Error(`MangaDex request failed: ${res.status}`)
                }
                let data = await res.json()
                let batch = data['data'] || []
                if (batch.length === 0) break

                // Verify the whole batch at once so a page costs one round trip
                // for the list plus one round trip for the checks.
                let checks = await Promise.all(
                    batch.map((comic) => this.hasReadableChapters(comic['id'], languages))
                )
                for (let i = 0; i < batch.length; i++) {
                    if (checks[i] && collected.length < perPage) {
                        collected.push(batch[i])
                    }
                }

                offset += batch.length
                if (offset >= (data['total'] || 0)) break
                if (offset >= this.maxWindow) break
            }

            let comics = []
            for (let comic of collected) {
                comics.push(this.api.parseComic(comic))
            }
            // The accepted count is unknowable up front (it depends on how many
            // candidates were stale), so report a conservative page bound: a
            // short page means the end of the list.
            let maxPage = collected.length < perPage ? Math.max(1, page || 1) : (page || 1) + 1
            return {
                comics: comics,
                maxPage: maxPage
            }
        },

        getPopular: async (page) => {
            // "Popular" is follow-count ordered, not a 30-day recency ranking.
            // The original window made the list stop at ~200 titles (10 pages)
            // and returned nothing past it; the whole catalogue is what the
            // label promises, so it is not date-bounded here.
            return await this.api.loadMangaList({
                'order[followedCount]': 'desc',
                'hasAvailableChapters': 'true',
                'contentRating[]': ['safe', 'suggestive', 'erotica']
            }, page)
        },

        getRecent: async (page) => {
            return await this.api.loadMangaList({
                'order[createdAt]': 'desc',
                'hasAvailableChapters': 'true',
                'contentRating[]': ['safe', 'suggestive', 'erotica']
            }, page)
        },

        getUpdated: async (page) => {
            return await this.api.loadMangaList({
                'order[latestUploadedChapter]': 'desc',
                'hasAvailableChapters': 'true',
                'contentRating[]': ['safe', 'suggestive', 'erotica']
            }, page)
        }
    }

    // Account feature is not implemented yet
    // TODO: implement account feature
    // account = {}

    // explore page list
    //
    // `multiPageComicList` + `optionList` renders Venera's filter panel above
    // the grid. `load` receives `(page, options, filters)`: `options` is the
    // positional value list, `filters` is the same selection keyed by label.
    // The label form is what this source reads, so reordering the options below
    // can never silently shift a filter onto the wrong query parameter.
    explore = [
        {
            // title of the page.
            // title is used to identify the page, it should be unique
            title: "Manga Dex",

            /// multiPartPage or multiPageComicList or mixed
            type: "multiPageComicList",

            optionList: this.commonFilterGroups(true),

            /**
             * @param page {number}
             * @param options {string[]} - positional values from optionList
             * @param filters {Object} - the same values keyed by label
             */
            load: async (page, options, filters) => {
                if (options == null) {
                    options = []
                }
                // Prefer the label map; fall back to positional for older
                // clients that only pass `options`.
                let f = filters || {}
                let read = (label, index, fallback) => {
                    let byLabel = f[label]
                    if (byLabel !== undefined && byLabel !== null && byLabel !== "") {
                        return byLabel
                    }
                    let positional = options[index]
                    if (positional !== undefined && positional !== null && positional !== "") {
                        return positional
                    }
                    return fallback
                }

                let params = {
                    'hasAvailableChapters': 'true'
                }
                this.applyCommonFilters(params, {
                    sort: read("Sort By", 0, "popular"),
                    demographic: read("Demographic", 1, "any"),
                    originalLanguage: read("Original Language", 2, "any"),
                    status: read("Status", 3, "any"),
                    contentRating: read("Content Rating", 4, "any"),
                    year: read("Year", 5, ""),
                    includeTags: read("Include Tags", 6, ""),
                })

                return await this.api.loadMangaList(params, page)
            },
        }
    ]

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "MangaDex",
        parts: [
            {
                // title of the part
                name: "Tags",

                // fixed or random or dynamic
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                // if dynamic, need to provide `loader` field, which indicates the function to load comics
                type: "dynamic",

                // number of comics to display at the same time
                // randomNumber: 5,

                // load function for dynamic type
                loader: () => {
                    let categories = []
                    for (let tag of Object.keys(this.tags)) {
                        categories.push({
                            label: tag,
                            target: {
                                page: "category",
                                attributes: {
                                    category: tag,
                                    param: this.tags[tag],
                                },
                            }
                        })
                    }
                    return categories
                }
            }
        ],
        // enable ranking page
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options = [], page = 1) => {
            let tagId = param || this.tags[category]
            if (!tagId) {
                throw new Error("No tag id provided for category comics")
            }

            const parseOption = (option, fallback) => {
                if (option === undefined || option === null || option === "") {
                    return fallback
                }
                let value = option.split("-")[0]
                return value || fallback
            }

            let params = {
                'hasAvailableChapters': 'true',
                'includedTags[]': tagId
            }

            this.applyCommonFilters(params, {
                sort: parseOption(options[0], "popular"),
                contentRating: parseOption(options[1], "any"),
                status: parseOption(options[2], "any"),
                demographic: parseOption(options[3], "any"),
                originalLanguage: parseOption(options[4], "any"),
            })

            return await this.api.loadMangaList(params, page)
        },
        optionList: this.commonFilterGroups(false)
    }

    /// search related
    search = {
        /**
         * load search result
         * @param keyword {string}
         * @param options {string[]} - options from optionList
         * @param page {number}
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (keyword, options, page) => {
            let params = {
                'hasAvailableChapters': 'true'
            }

            let sort = options[0] && options[0] !== "any" ? options[0] : ""
            // Relevance is only meaningful for a keyword search.
            if (!sort && keyword && keyword.trim() !== "") {
                sort = "relevance"
            }

            this.applyCommonFilters(params, {
                sort: sort,
                contentRating: options[1],
                status: options[2],
                demographic: options[3],
                originalLanguage: options[4],
            })

            if (keyword) {
                let splits = keyword.split(" ")
                let reformated = []
                let includedTags = []
                for (let s of splits) {
                    if (s === "") {
                        continue
                    }
                    if (s.startsWith('tag:')) {
                        let tag = s.substring(4)
                        tag = tag.replaceAll('_', ' ')
                        let id = this.tags[tag]
                        if (id !== undefined) {
                            includedTags.push(id)
                        } else {
                            reformated.push(tag)
                        }
                    } else if (s.startsWith('author:') || s.startsWith('artist:')) {
                        let prefix = s.startsWith('author:') ? 'author:' : 'artist:'
                        let name = s.substring(prefix.length)
                        name = name.replaceAll('_', ' ')
                        let id = this.authors[name] ?? this.artists[name]
                        if (id !== undefined) {
                            params['authorOrArtist'] = id
                        } else {
                            reformated.push(name)
                        }
                    } else {
                        reformated.push(s)
                    }
                }
                if (includedTags.length > 0) {
                    params['includedTags[]'] = includedTags
                }
                keyword = reformated.join(" ").trim()
                if (keyword !== "") {
                    params['title'] = keyword
                }
            }

            return await this.api.loadMangaList(params, page)
        },

        // provide options for search
        // Search leads with "Relevance" (what a keyword query should default
        // to) and then reuses the same filter groups as explore / category.
        optionList: [
            {
                label: "Sort By",
                type: "select",
                options: [
                    "relevance-Relevance",
                    "any-Any",
                    "popular-Popular (follows)",
                    "rating-Rating",
                    "updated-Recently updated",
                    "recent-Recently added",
                    "title-Title A-Z",
                    "year-Year (newest)",
                ],
            },
        ].concat(this.commonFilterGroups(false).slice(1)),

        // enable tags suggestions
        enableTagsSuggestions: false,
    }

    /// single comic related
    comic = {
        getComic: async (id) => {
            let res = await MangaDex.fetchApi(`https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=artist&includes[]=author`)
            if (!res.ok) {
                throw new Error(`MangaDex request failed: ${res.status}`)
            }
            let data = await res.json()
            return this.api.parseComic(data['data'])
        },
        getChapters: async (id) => {
            // Only readable chapters in the chosen language: externally hosted
            // (licensed) chapters have no pages here, so they are left out
            // rather than listed and then failing on tap.
            let rows = await this.fetchChapterRows(id, this.getChapterLanguages())

            // Count uploads per chapter number so only the numbers that really
            // appear more than once get the language/group suffix.
            let numberCount = new Map()
            for (let row of rows) {
                let number = row['attributes']?.['chapter']
                if (number === undefined || number === null) continue
                numberCount.set(number, (numberCount.get(number) || 0) + 1)
            }

            let chapters = new Map()
            for (let row of rows) {
                let number = row['attributes']?.['chapter']
                let duplicated = number !== undefined && number !== null && numberCount.get(number) > 1
                this.appendChapter(chapters, row, duplicated)
            }
            return chapters
        },
        getStats: async (id) => {
            let res = await MangaDex.fetchApi(`https://api.mangadex.org/statistics/manga/${id}`)
            if (!res.ok) {
                throw new Error(`MangaDex request failed: ${res.status}`)
            }
            let data = await res.json()
            let stats = data['statistics']?.[id]
            if (!stats) {
                return { comments: 0, threadId: undefined, follows: 0, rating: 0 }
            }
            return {
                comments: stats['comments']?.['repliesCount'] || 0,
                threadId: stats['comments']?.['threadId'],
                follows: stats['follows'] || 0,
                rating: stats['rating']?.['average'] || 0,
            }
        },
        /**
         * load comic info
         * @param id {string}
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            let res = await Promise.all([
                this.comic.getComic(id),
                this.comic.getChapters(id),
                this.comic.getStats(id)
            ])
            let comic = res[0]
            let chapters = res[1]
            let stats = res[2]

            let tags = {
                "Tags": comic.tags,
                "Authors": comic.authors,
                "Artists": comic.artists,
            }
            let statusName = this.statusNames[comic.status]
            if (statusName) {
                tags["Status"] = [statusName]
            }

            return new ComicDetails({
                id: comic.id,
                title: comic.title,
                subtitle: comic.subtitle,
                cover: comic.cover,
                tags: tags,
                description: comic.description,
                updateTime: comic.updateTime,
                uploadTime: comic.createTime,
                status: comic.status,
                chapters: chapters,
                stars: (stats.rating || 0) / 2,
                url: `https://mangadex.org/title/${comic.id}`,
            })
        },

        /**
         * rate a comic
         * @param id
         * @param rating {number} - [0-10] app use 5 stars, 1 rating = 0.5 stars,
         * @returns {Promise<any>} - return any value to indicate success
         */
        starRating: async (id, rating) => {
            // TODO: implement star rating
        },

        /**
         * load images of a chapter
         * @param comicId {string}
         * @param epId {string?}
         * @returns {Promise<{images: string[]}>}
         */
        loadEp: async (comicId, epId) => {
            if (!epId) {
                throw new Error("No chapter id provided")
            }
            // External (licensed) chapters are filtered out of the chapter list
            // by `includeExternalUrl=0`, so an id reaching this point is a
            // hosted one. Guard anyway: a stale chapter id from history could
            // still refer to a chapter that has since moved off-site.
            let infoRes = await MangaDex.fetchApi(`https://api.mangadex.org/chapter/${epId}`)
            if (infoRes.ok) {
                let info = await infoRes.json()
                let externalUrl = info['data']?.['attributes']?.['externalUrl']
                if (externalUrl) {
                    throw new Error("This chapter is only hosted on the publisher's site and has no pages here.")
                }
            }

            let res = await MangaDex.fetchApi(`https://api.mangadex.org/at-home/server/${epId}`)
            if (!res.ok) {
                throw new Error(`MangaDex request failed: ${res.status}`)
            }
            let data = await res.json()
            let baseUrl = data['baseUrl'] || "https://uploads.mangadex.org"
            let hash = data['chapter']?.['hash']
            if (!hash) {
                throw new Error("This chapter has no hosted pages")
            }
            let images = []
            let image_quality = this.loadSetting("image_quality")
            if (image_quality == "Original") {
                for (let image of (data['chapter']['data'] || [])) {
                    images.push(`${baseUrl}/data/${hash}/${image}`)
                }
            } else {
                for (let image of (data['chapter']['dataSaver'] || [])) {
                    images.push(`${baseUrl}/data-saver/${hash}/${image}`)
                }
            }
            if (images.length === 0) {
                throw new Error("This chapter has no hosted pages")
            }
            return {
                images: images
            }
        },
        /**
         * [Optional] load comments
         *
         * Since app version 1.0.6, rich text is supported in comments.
         * Following html tags are supported: ['a', 'b', 'i', 'u', 's', 'br', 'span', 'img'].
         * span tag supports style attribute, but only support font-weight, font-style, text-decoration.
         * All images will be placed at the end of the comment.
         * Auto link detection is enabled, but only http/https links are supported.
         * @param comicId {string}
         * @param subId {string?} - ComicDetails.subId
         * @param page {number}
         * @param replyTo {string?} - commentId to reply, not null when reply to a comment
         * @returns {Promise<{comments: Comment[], maxPage: number?}>}
         */
        loadComments: async (comicId, subId, page, replyTo) => {
            let stats = await this.comic.getStats(comicId)
            let threadId = stats.threadId
            if (!threadId) {
                return { comments: [], maxPage: 1 }
            }
            let url = `https://forums.mangadex.org/threads/${threadId}/page-${page || 1}`
            // The forum blocks browser-looking User-Agents (403 Bot challenge),
            // so this must not go through fetchApi's defaults either.
            let res = await MangaDex.fetchApi(url, {
                headers: { "User-Agent": "MangaDex-for-Venera/1.0", "Accept": "text/html" }
            })
            if (!res.ok) {
                throw new Error(`Failed to load forum page: ${res.status}`)
            }
            let htmlText = await res.text()
            let document = new HtmlDocument(htmlText)
            let comments = []

            let messageElements = document.querySelectorAll("article.message")
            for (let msg of messageElements) {
                let id = msg.attributes['data-content'] || msg.attributes['id'] || ""

                // The author lives in `.message-name > a`; fall back to the
                // `data-author` attribute the forum puts on the article.
                let userNameElement = msg.querySelector(".message-name")
                let userName = userNameElement ? userNameElement.text.trim() : ""
                if (!userName) {
                    userName = msg.attributes['data-author'] || "Unknown"
                }

                let avatarElement = msg.querySelector(".message-avatar img") || msg.querySelector(".avatar img")
                let avatar = avatarElement ? avatarElement.attributes['src'] : null
                if (avatar && avatar.startsWith('/')) {
                    avatar = "https://forums.mangadex.org" + avatar
                }

                let timeElement = msg.querySelector("time")
                let time = timeElement ? (timeElement.attributes['datetime'] || timeElement.text) : "Unknown"

                let contentElement = msg.querySelector(".bbWrapper")
                let content = ""
                if (contentElement) {
                    content = contentElement.innerHTML.replace(/[\r\n\t]+/g, '')

                    // Remove "Click to expand" button
                    content = content.replace(/<div class="bbCodeBlock-expandLink[^>]*>.*?<\/div>/gi, '')
                    // Remove the script block
                    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

                    // Quote Style
                    // TODO: Modify font color/size when venera supports it
                    content = content.replace(/<blockquote[^>]*>/gi, '<span style="font-style:italic;font-weight:lighter">')
                    content = content.replace(/<\/blockquote>/gi, '</span>')

                    // Spoiler Style
                    content = content.replace(/<button[^>]*class="[^"]*bbCodeSpoiler-button[^"]*"[^>]*>([\s\S]*?)<\/button>/gi, '<span style="font-weight:bold">[$1]</span>')

                    // Process Image
                    content = content.replace(/<img([^>]*)>/gi, (match, attrs) => {
                        // Smilie Image
                        if (attrs.includes('smilie')) {
                            let altMatch = attrs.match(/alt="([^"]+)"/i)
                            return altMatch ? altMatch[1] : ''
                        }

                        let srcMatch = attrs.match(/src="([^"]+)"/i)
                        if (srcMatch) {
                            let imgUrl = srcMatch[1]
                            // Relative Path
                            if (imgUrl.startsWith('/')) {
                                imgUrl = "https://forums.mangadex.org" + imgUrl
                                return `<img${attrs.replace(srcMatch[0], `src="${imgUrl}"`)}>`
                            }
                        }

                        return match
                    })

                    // Process other tags
                    content = content.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (match, tag) => {
                        const allowed = ['img', 'a', 'b', 'i', 'u', 's', 'br', 'span', 'strong']
                        if (allowed.includes(tag.toLowerCase())) {
                            return match
                        }
                        if (['div', 'p'].includes(tag.toLowerCase()) && match.startsWith('</')) {
                            return '<br>'
                        }
                        return ''
                    })
                }

                comments.push(new Comment({
                    id: id,
                    userName: userName,
                    avatar: avatar,
                    content: content,
                    time: time
                }))
            }

            // The forum only renders the page links it needs; the highest
            // `page-N` link is the last page of the thread.
            let maxPage = page || 1
            for (let match of htmlText.matchAll(/\/threads\/[^"'\s]*\/page-(\d+)/g)) {
                let parsed = parseInt(match[1])
                if (!isNaN(parsed)) {
                    maxPage = Math.max(maxPage, parsed)
                }
            }
            document.dispose()
            return {
                comments: comments,
                maxPage: maxPage
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
            throw new Error("Not implemented")
        },
        /**
         * [Optional] provide configs for an image loading
         *
         * MangaDex's image CDN sits behind the same bot protection as the
         * forum: a browser-looking User-Agent is answered with
         * `403 Bot challenge not passed, refresh this page.` (verified — Chrome
         * UA 403, `venera/1.0` / curl / no UA 200). Venera's image loader forces
         * `webUA` (a Chrome UA) whenever a source does not specify one, so the
         * header must be set explicitly here or every cover and page image
         * fails to decode ("Invalid image data").
         * @param url
         * @param comicId
         * @param epId
         * @returns {ImageLoadingConfig | Promise<ImageLoadingConfig>}
         */
        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    "User-Agent": "venera/1.0",
                    "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
                },
            }
        },
        /**
         * [Optional] provide configs for a thumbnail loading
         * @param url {string}
         * @returns {ImageLoadingConfig | Promise<ImageLoadingConfig>}
         */
        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "User-Agent": "venera/1.0",
                    "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
                },
            }
        },
        /**
         * [Optional] Handle tag click event
         * @param namespace {string}
         * @param tag {string}
         * @returns {PageJumpTarget}
         */
        onClickTag: (namespace, tag) => {
            let keyword = tag
            if (namespace === "Tags") {
                keyword = `tag:${tag.replaceAll(' ', '_')}`
            } else if (namespace === "Authors") {
                keyword = `author:${tag.replaceAll(' ', '_')}`
            } else if (namespace === "Artists") {
                keyword = `artist:${tag.replaceAll(' ', '_')}`
            } else {
                // Status is a display-only tag group; the status filter is the
                // honest way to reach it.
                return {
                    page: "search",
                    attributes: {
                        'keyword': "",
                        'options': ["any", "any", tag.toLowerCase()],
                    },
                }
            }
            return {
                page: "search",
                attributes: {
                    'keyword': keyword,
                },
            }
        },
        /**
         * [Optional] Handle links
         */
        link: {
            /**
             * set accepted domains
             */
            domains: [
                'mangadex.org'
            ],
            /**
             * parse url to comic id
             * @param url {string}
             * @returns {string | null}
             */
            linkToId: (url) => {
                if (url.includes('?')) {
                    url = url.split('?')[0]
                }
                let match = url.match(/\/(title|manga)\/([a-f0-9-]{36})/i)
                return match ? match[2] : null
            }
        },
    }

    settings = {
        image_quality: {
            title: "Image Quality",
            type: "select",
            options: [
                {
                    value: 'Original',
                    text: 'Original'
                },
                {
                    value: 'Compressed',
                    text: 'Compressed'
                }
            ],
            default: "Original"
        },
        chapter_language: {
            title: "Chapter Language",
            type: "select",
            options: [
                { value: 'auto', text: 'Follow app language' },
                { value: 'en', text: 'English' },
                { value: 'zh', text: 'Chinese' },
                { value: 'ja', text: 'Japanese' },
                { value: 'ko', text: 'Korean' },
                { value: 'es', text: 'Spanish' },
                { value: 'pt', text: 'Portuguese' },
                { value: 'fr', text: 'French' },
                { value: 'ru', text: 'Russian' },
                { value: 'de', text: 'German' },
                { value: 'it', text: 'Italian' },
                { value: 'id', text: 'Indonesian' },
                { value: 'vi', text: 'Vietnamese' },
                { value: 'th', text: 'Thai' },
                { value: 'ar', text: 'Arabic' },
            ],
            default: "auto"
        }
    }

    // [Optional] translations for the strings in this config
    //
    // Venera renders a filter's label and every option text through
    // `text.ts(sourceKey)`, so each `value-text` display string and each group
    // label must have an entry here to appear in Chinese.
    translation = {
        'zh_CN': {
            "Image Quality": "图片质量",
            "Original": "原图",
            "Compressed": "压缩图",
            "Chapter Language": "章节语言",
            "Follow app language": "跟随应用语言",

            // --- 筛选分组 ---
            "Sort By": "排序",
            "Demographic": "受众",
            "Original Language": "原文语言",
            "Status": "状态",
            "Content Rating": "内容分级",
            "Year": "年份",
            "Include Tags": "包含标签",

            // --- 通用 ---
            "Any": "不限",
            "None": "无",

            // --- 排序 ---
            "Relevance": "相关度",
            "Popular (follows)": "热门（追番数）",
            "Rating": "评分",
            "Recently updated": "最近更新",
            "Recently added": "最近上架",
            "Title A-Z": "标题 A-Z",
            "Year (newest)": "年份（最新）",
            "Popular": "热门",
            "Recent": "最新",
            "Updated": "最近更新",
            "Follows": "追番数",

            // --- 受众 ---
            "Shounen": "少年",
            "Shoujo": "少女",
            "Seinen": "青年",
            "Josei": "女性",

            // --- 原文语言 ---
            "Japanese": "日语",
            "Korean": "韩语",
            "Chinese": "中文",
            "Chinese (HK)": "中文（香港）",
            "English": "英语",
            "French": "法语",
            "Spanish": "西班牙语",
            "Russian": "俄语",
            "Indonesian": "印尼语",
            "Vietnamese": "越南语",
            "Thai": "泰语",
            "German": "德语",
            "Italian": "意大利语",
            "Portuguese": "葡萄牙语",
            "Arabic": "阿拉伯语",

            // --- 连载状态 ---
            "Ongoing": "连载中",
            "Completed": "已完结",
            "Hiatus": "休刊",
            "Cancelled": "已取消",

            // --- 内容分级 ---
            "Safe": "安全",
            "Suggestive": "暗示",
            "Erotica": "情色",

            // --- 标签命名空间 ---
            "Tags": "标签",
            "Authors": "作者",
            "Artists": "画师",
        },
        'zh_TW': {
            "Image Quality": "圖片品質",
            "Original": "原圖",
            "Compressed": "壓縮圖",
            "Chapter Language": "章節語言",
            "Follow app language": "跟隨應用語言",

            // --- 篩選分組 ---
            "Sort By": "排序",
            "Demographic": "受眾",
            "Original Language": "原文語言",
            "Status": "狀態",
            "Content Rating": "內容分級",
            "Year": "年份",
            "Include Tags": "包含標籤",

            // --- 通用 ---
            "Any": "不限",
            "None": "無",

            // --- 排序 ---
            "Relevance": "相關度",
            "Popular (follows)": "熱門（追番數）",
            "Rating": "評分",
            "Recently updated": "最近更新",
            "Recently added": "最近上架",
            "Title A-Z": "標題 A-Z",
            "Year (newest)": "年份（最新）",
            "Popular": "熱門",
            "Recent": "最新",
            "Updated": "最近更新",
            "Follows": "追番數",

            // --- 受眾 ---
            "Shounen": "少年",
            "Shoujo": "少女",
            "Seinen": "青年",
            "Josei": "女性",

            // --- 原文語言 ---
            "Japanese": "日語",
            "Korean": "韓語",
            "Chinese": "中文",
            "Chinese (HK)": "中文（香港）",
            "English": "英語",
            "French": "法語",
            "Spanish": "西班牙語",
            "Russian": "俄語",
            "Indonesian": "印尼語",
            "Vietnamese": "越南語",
            "Thai": "泰語",
            "German": "德語",
            "Italian": "義大利語",
            "Portuguese": "葡萄牙語",
            "Arabic": "阿拉伯語",

            // --- 連載狀態 ---
            "Ongoing": "連載中",
            "Completed": "已完結",
            "Hiatus": "休刊",
            "Cancelled": "已取消",

            // --- 內容分級 ---
            "Safe": "安全",
            "Suggestive": "暗示",
            "Erotica": "情色",

            // --- 標籤命名空間 ---
            "Tags": "標籤",
            "Authors": "作者",
            "Artists": "畫師",
        },
        'en': {}
    }

    tags = {
        "4-Koma":"b11fda93-8f1d-4bef-b2ed-8803d3733170","Action":"391b0423-d847-456f-aff0-8b0cfc03066b",
        "Adaptation":"f4122d1c-3b44-44d0-9936-ff7502c39ad3","Adventure":"87cc87cd-a395-47af-b27a-93258283bbc6",
        "Aliens":"e64f6742-c834-471d-8d72-dd51fc02b835","Animals":"3de8c75d-8ee3-48ff-98ee-e20a65c86451",
        "Anthology":"51d83883-4103-437c-b4b1-731cb73d786c","Award Winning":"0a39b5a1-b235-4886-a747-1d05d216532d",
        "Boys' Love":"5920b825-4181-4a17-beeb-9918b0ff7a30","Comedy":"4d32cc48-9f00-4cca-9b5a-a839f0764984",
        "Cooking":"ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869","Crime":"5ca48985-9a9d-4bd8-be29-80dc0303db72",
        "Crossdressing":"9ab53f92-3eed-4e9b-903a-917c86035ee3","Delinquents":"da2d50ca-3018-4cc0-ac7a-6b7d472a29ea",
        "Demons":"39730448-9a5f-48a2-85b0-a70db87b1233","Doujinshi":"b13b2a48-c720-44a9-9c77-39c9979373fb",
        "Drama":"b9af3a63-f058-46de-a9a0-e0c13906197a","Fan Colored":"7b2ce280-79ef-4c09-9b58-12b7c23a9b78",
        "Fantasy":"cdc58593-87dd-415e-bbc0-2ec27bf404cc","Full Color":"f5ba408b-0e7a-484d-8d49-4e9125ac96de",
        "Genderswap":"2bd2e8d0-f146-434a-9b51-fc9ff2c5fe6a","Ghosts":"3bb26d85-09d5-4d2e-880c-c34b974339e9",
        "Girls' Love":"a3c67850-4684-404e-9b7f-c69850ee5da6","Gore":"b29d6a3d-1569-4e7a-8caf-7557bc92cd5d",
        "Gyaru":"fad12b5e-68ba-460e-b933-9ae8318f5b65","Harem":"aafb99c1-7f60-43fa-b75f-fc9502ce29c7",
        "Historical":"33771934-028e-4cb3-8744-691e866a923e","Horror":"cdad7e68-1419-41dd-bdce-27753074a640",
        "Incest":"5bd0e105-4481-44ca-b6e7-7544da56b1a3","Isekai":"ace04997-f6bd-436e-b261-779182193d3d",
        "Loli":"2d1f5d56-a1e5-4d0d-a961-2193588b08ec","Long Strip":"3e2b8dae-350e-4ab8-a8ce-016e844b9f0d",
        "Mafia":"85daba54-a71c-4554-8a28-9901a8b0afad","Magical Girls":"81c836c9-914a-4eca-981a-560dad663e73",
        "Magic":"a1f53773-c69a-4ce5-8cab-fffcd90b1565","Mahjong":"cb562697-929f-4d28-9d66-6d3995bf2592",
        "Martial Arts":"799c202e-7daa-44eb-9cf7-8a3c0441531e","Mecha":"50880a9d-5440-4732-9afb-8f457127e836",
        "Medical":"c8cbe35b-1b2b-4a3f-9c37-db84c4514856","Military":"ac72833b-c4e9-4878-b9db-6c8a4a99444a",
        "Monster Girls":"dd1f77c5-dea9-4e2b-97ae-224af09caf99","Monsters":"36fd93ea-e8b8-445e-b836-358f02b3d33d",
        "Music":"f42fbf9e-188a-447b-9fdc-f19dc1e4d685","Mystery":"ee968100-4191-4968-93d3-f82d72be7e46",
        "Ninja":"489dd859-9b61-4c37-af75-5b18e88daafc","Office Workers":"92d6d951-ca5e-429c-ac78-451071cbf064",
        "Official Colored":"320831a8-4026-470b-94f6-8353740e6f04","Oneshot":"0234a31e-a729-4e28-9d6a-3f87c4966b9e",
        "Philosophical":"b1e97889-25b4-4258-b28b-cd7f4d28ea9b","Police":"df33b754-73a3-4c54-80e6-1a74a8058539",
        "Post-Apocalyptic":"9467335a-1b83-4497-9231-765337a00b96","Psychological":"3b60b75c-a2d7-4860-ab56-05f391bb889c",
        "Reincarnation":"0bc90acb-ccc1-44ca-a34a-b9f3a73259d0","Reverse Harem":"65761a2a-415e-47f3-bef2-a9dababba7a6",
        "Romance":"423e2eae-a7a2-4a8b-ac03-a8351462d71d","Samurai":"81183756-1453-4c81-aa9e-f6e1b63be016",
        "School Life":"caaa44eb-cd40-4177-b930-79d3ef2afe87","Sci-Fi":"256c8bd9-4904-4360-bf4f-508a76d67183",
        "Self-Published":"891cf039-b895-47f0-9229-bef4c96eccd4","Sexual Violence":"97893a4c-12af-4dac-b6be-0dffb353568e",
        "Shota":"ddefd648-5140-4e5f-ba18-4eca4071d19b","Slice of Life":"e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
        "Sports":"69964a64-2f90-4d33-beeb-f3ed2875eb4c","Superhero":"7064a261-a137-4d3a-8848-2d385de3a99c",
        "Supernatural":"eabc5b4c-6aff-42f3-b657-3e90cbd00b75","Survival":"5fff9cde-849c-4d78-aab0-0d52b2ee1d25",
        "Thriller":"07251805-a27e-4d59-b488-f0bfbec15168","Time Travel":"292e862b-2d17-4062-90a2-0356caa4ae27",
        "Traditional Games":"31932a7e-5b8e-49a6-9f12-2afa39dc544c","Tragedy":"f8f62932-27da-4fe4-8ee1-6779a8c5edba",
        "Vampires":"d7d1730f-6eb0-4ba6-9437-602cac38664c","Video Games":"9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8",
        "Villainess":"d14322ac-4d6f-4e9b-afd9-629d5f4d8a41","Virtual Reality":"8c86611e-fab7-4986-9dec-d1a2f44acdd5",
        "Web Comic":"e197df38-d0e7-43b5-9b09-2842d0c326dd","Wuxia":"acc803a4-c95a-4c22-86fc-eb6b582d82a2",
        "Zombies":"631ef465-9aba-4afb-b0fc-ea10efe274a8"
    }

    // [authors] and [artists] are dynamic map
    authors = {}
    artists = {}

    /**
     * Add one feed row to the grouped chapter map. Chapters are grouped by
     * volume. When several uploads share a chapter number (different
     * scanlation groups, or a multi-language list), the language/group is
     * appended to the label so they stay distinguishable instead of one
     * silently replacing another.
     */
    appendChapter(chapters, chapter, duplicated) {
        let attributes = chapter['attributes'] || {}
        let chapterId = chapter['id']
        let number = attributes['chapter']
        let title = attributes['title']
        let language = attributes['translatedLanguage']
        let volume = attributes['volume']

        let label
        if (number) {
            label = `Ch.${number}`
        } else if (volume) {
            label = `Vol.${volume}`
        } else {
            label = "Oneshot"
        }
        if (title) {
            label = `${label}: ${title}`
        }
        // Only disambiguate the labels that actually need it, so the common
        // one-upload-per-chapter list stays clean.
        if (duplicated) {
            let group = chapter['relationships']?.find((r) => r['type'] === 'scanlation_group')?.['attributes']?.['name']
            let suffix = []
            if (language) suffix.push(this.languageNames[language] || language)
            if (group) suffix.push(group)
            if (suffix.length > 0) {
                label = `${label} [${suffix.join(" / ")}]`
            }
        }
        let volumeName = volume ? `Volume ${volume}` : "No Volume"
        if (chapters.get(volumeName) === undefined) {
            chapters.set(volumeName, new Map())
        }
        chapters.get(volumeName).set(chapterId, label)
    }

    /**
     * Does this title have at least one *readable* chapter in [languages]?
     *
     * Externally hosted (licensed) chapters have no pages of their own, so they
     * do not count as readable — that is what `includeExternalUrl=0` asks for.
     */
    async hasReadableChapters(id, languages) {
        let query = languages
            .map((l) => `translatedLanguage[]=${encodeURIComponent(l)}`)
            .join("&")
        let res = await MangaDex.fetchApi(
            `https://api.mangadex.org/manga/${id}/feed?limit=1&${query}&includeExternalUrl=0`
        )
        // A failed probe must not silently drop a title from listings.
        if (!res.ok) return true
        let data = await res.json()
        return (data['total'] || 0) > 0
    }

    /**
     * Fetch every readable chapter feed row for a title, paging until the list
     * is exhausted or the API's 10k result window is reached.
     * @param id {string}
     * @param languages {string[]|null} - null asks for every language
     */
    async fetchChapterRows(id, languages) {
        let rows = []
        let offset = 0
        while (offset < this.maxWindow) {
            // `includeExternalUrl` is a filter, not a toggle: `=0` returns only
            // chapters MangaDex actually hosts (external ones have no pages and
            // could never be read in the app), `=1` would return only the
            // external ones, and omitting it returns both.
            let url = `https://api.mangadex.org/manga/${id}/feed?` +
                `limit=${this.chaptersPerPage}&` +
                `offset=${offset}&` +
                `order[volume]=asc&` +
                `order[chapter]=asc&` +
                `includeExternalUrl=0&` +
                `includes[]=scanlation_group`
            if (languages !== null) {
                for (let lang of languages) {
                    url += `&translatedLanguage[]=${encodeURIComponent(lang)}`
                }
            }
            let res = await MangaDex.fetchApi(url)
            if (!res.ok) {
                throw new Error(`MangaDex request failed: ${res.status}`)
            }
            let data = await res.json()
            let page = data['data'] || []
            rows.push(...page)
            offset += this.chaptersPerPage
            if (page.length < this.chaptersPerPage) {
                break
            }
            if (data['total'] && offset >= data['total']) {
                break
            }
        }
        return rows
    }
}
