const languages = [
  ['zhCN', '简体中文'], ['en', 'English'], ['fr', 'Français'],
  ['ru', 'Русский'], ['ja', '日本語'], ['vi', 'Tiếng Việt'], ['zhTW', '繁體中文'],
]

// Set to true after the VitePress documentation site is ready at /docs.
const documentationEnabled = false

const translations = {
  zhCN: ['控制台','模型广场','排行榜','文档','阅读文档','关于','关于我们','常见问答','更新日志','立即开始','更改语言','一个接口，连接所有主流 AI 模型','让每一次智能调用，都简单可靠','LLMAPI 为团队与开发者提供统一、稳定、安全的 AI 模型服务。专注产品创新，其余交给我们。','请求已准备就绪','服务可用性','主流模型提供商','低延迟接入体验','持续稳定服务','为生产环境而生','一个平台，承载完整的 AI 工作流','从模型选择到调用分析，用更少的复杂度获得更好的体验。','统一 API','使用熟悉的接口，在多个模型与供应商之间自由切换。','稳定可靠','智能调度与故障切换，保障关键业务持续可用。','清晰可控','从用量、费用到模型表现，每一笔调用都有据可查。','不断扩展的能力边界','选择适合你的模型','快速、全能的多模态能力','长文本与复杂推理','原生多模态与高效执行','现在开始构建','把精力留给真正重要的产品。','创建账号，几分钟内开始调用你需要的 AI 模型。','创建免费账号'],
  en: ['Console','Models','Rankings','Documentation','Read documentation','About','About us','FAQ','Changelog','Get started','Change language','One API for leading AI models','Make every AI call simple and reliable','LLMAPI gives teams and developers a unified, stable, and secure AI model service. Focus on your product and leave the complexity to us.','Request ready','Service availability','Leading model providers','Low-latency access','Reliable service','Built for production','One platform for the complete AI workflow','From model choice to usage insights, achieve more with less complexity.','Unified API','Use a familiar interface and switch freely between models and providers.','Reliable by design','Intelligent routing and failover keep critical services available.','Clear control','Every request is visible, from usage and cost to model performance.','Capabilities that keep expanding','Choose the model that fits','Fast, versatile multimodal intelligence','Long context and complex reasoning','Native multimodality and efficiency','Build now','Keep your focus on what matters.','Create an account and call the AI models you need in minutes.','Create a free account'],
  zhTW: ['控制台','模型廣場','排行榜','文件','閱讀文件','關於','關於我們','常見問答','更新日誌','立即開始','更改語言','一個介面，連接所有主流 AI 模型','讓每一次智慧呼叫，都簡單可靠','LLMAPI 為團隊與開發者提供統一、穩定、安全的 AI 模型服務。專注產品創新，其餘交給我們。','請求已準備就緒','服務可用性','主流模型供應商','低延遲接入體驗','持續穩定服務','為生產環境而生','一個平台，承載完整的 AI 工作流程','從模型選擇到呼叫分析，用更少的複雜度獲得更好的體驗。','統一 API','使用熟悉的介面，在多個模型與供應商之間自由切換。','穩定可靠','智慧調度與故障切換，保障關鍵業務持續可用。','清晰可控','從用量、費用到模型表現，每一筆呼叫都有據可查。','不斷擴展的能力邊界','選擇適合你的模型','快速、全能的多模態能力','長文字與複雜推理','原生多模態與高效執行','現在開始建置','把精力留給真正重要的產品。','建立帳號，幾分鐘內開始呼叫你需要的 AI 模型。','建立免費帳號'],
  ja: ['コンソール','モデル広場','ランキング','ドキュメント','ドキュメントを読む','概要','私たちについて','よくある質問','更新履歴','今すぐ始める','言語を変更','1つのAPIで主要なAIモデルに接続','すべてのAI呼び出しを、シンプルで確実に','LLMAPIは、チームと開発者に統一された安定かつ安全なAIモデルサービスを提供します。製品開発に集中し、複雑さは私たちにお任せください。','リクエスト準備完了','サービス稼働率','主要モデルプロバイダー','低遅延アクセス','安定した継続サービス','本番環境のために設計','AIワークフロー全体を支える1つのプラットフォーム','モデル選択から利用分析まで、複雑さを抑えて優れた体験を実現します。','統一API','使い慣れたインターフェースで、モデルやプロバイダーを自由に切り替えられます。','高い信頼性','インテリジェントなルーティングとフェイルオーバーで重要なサービスを維持します。','明確な管理','使用量、費用、モデル性能まで、すべてのリクエストを確認できます。','広がり続ける可能性','最適なモデルを選択','高速で多用途なマルチモーダル性能','長文コンテキストと複雑な推論','ネイティブなマルチモーダルと高効率','今すぐ構築','本当に大切な製品に集中しましょう。','アカウントを作成し、数分で必要なAIモデルを利用できます。','無料アカウントを作成'],
  fr: ['Console','Modèles','Classement','Documentation','Lire la documentation','À propos','À propos de nous','FAQ','Journal des modifications','Commencer','Changer de langue','Une API pour les principaux modèles d’IA','Rendez chaque appel IA simple et fiable','LLMAPI offre aux équipes et aux développeurs un service de modèles d’IA unifié, stable et sécurisé. Concentrez-vous sur votre produit, nous gérons la complexité.','Requête prête','Disponibilité du service','Principaux fournisseurs de modèles','Accès à faible latence','Service fiable en continu','Conçu pour la production','Une plateforme pour tout le flux de travail IA','Du choix du modèle à l’analyse de l’utilisation, obtenez davantage avec moins de complexité.','API unifiée','Utilisez une interface familière et passez librement d’un modèle ou fournisseur à l’autre.','Fiabilité intégrée','Le routage intelligent et le basculement maintiennent vos services essentiels disponibles.','Contrôle clair','Chaque requête est visible, de l’utilisation et du coût aux performances du modèle.','Des capacités en constante évolution','Choisissez le modèle adapté','Intelligence multimodale rapide et polyvalente','Contexte long et raisonnement complexe','Multimodalité native et efficacité','Construisez maintenant','Concentrez-vous sur ce qui compte.','Créez un compte et utilisez les modèles d’IA dont vous avez besoin en quelques minutes.','Créer un compte gratuit'],
  ru: ['Консоль','Модели','Рейтинг','Документация','Читать документацию','О проекте','О нас','Вопросы и ответы','Журнал изменений','Начать','Изменить язык','Один API для ведущих моделей ИИ','Каждый вызов ИИ — просто и надёжно','LLMAPI предоставляет командам и разработчикам единый, стабильный и безопасный сервис моделей ИИ. Сосредоточьтесь на продукте, а сложность оставьте нам.','Запрос готов','Доступность сервиса','Ведущие поставщики моделей','Низкая задержка','Стабильная работа','Создано для эксплуатации','Одна платформа для полного рабочего процесса ИИ','От выбора модели до анализа использования — больше возможностей с меньшей сложностью.','Единый API','Используйте знакомый интерфейс и свободно переключайтесь между моделями и поставщиками.','Надёжность','Умная маршрутизация и переключение при сбоях поддерживают критически важные сервисы.','Полный контроль','Каждый запрос прозрачен: от использования и стоимости до производительности модели.','Постоянно растущие возможности','Выберите подходящую модель','Быстрые универсальные мультимодальные возможности','Длинный контекст и сложные рассуждения','Нативная мультимодальность и эффективность','Начните сейчас','Сосредоточьтесь на действительно важном.','Создайте аккаунт и начните использовать нужные модели ИИ за несколько минут.','Создать бесплатный аккаунт'],
  vi: ['Bảng điều khiển','Kho mô hình','Xếp hạng','Tài liệu','Đọc tài liệu','Giới thiệu','Về chúng tôi','Câu hỏi thường gặp','Nhật ký cập nhật','Bắt đầu','Đổi ngôn ngữ','Một API cho các mô hình AI hàng đầu','Mọi lệnh gọi AI đều đơn giản và đáng tin cậy','LLMAPI cung cấp cho đội ngũ và nhà phát triển dịch vụ mô hình AI thống nhất, ổn định và an toàn. Hãy tập trung vào sản phẩm, chúng tôi sẽ xử lý phần phức tạp.','Yêu cầu đã sẵn sàng','Độ sẵn sàng của dịch vụ','Nhà cung cấp mô hình hàng đầu','Truy cập độ trễ thấp','Dịch vụ ổn định liên tục','Được xây dựng cho môi trường thực tế','Một nền tảng cho toàn bộ quy trình AI','Từ lựa chọn mô hình đến phân tích sử dụng, đạt hiệu quả cao hơn với ít phức tạp hơn.','API thống nhất','Sử dụng giao diện quen thuộc và chuyển đổi linh hoạt giữa các mô hình và nhà cung cấp.','Thiết kế đáng tin cậy','Định tuyến thông minh và chuyển đổi dự phòng giúp duy trì các dịch vụ quan trọng.','Kiểm soát rõ ràng','Mọi yêu cầu đều có thể theo dõi, từ mức sử dụng và chi phí đến hiệu suất mô hình.','Khả năng không ngừng mở rộng','Chọn mô hình phù hợp','Khả năng đa phương thức nhanh và linh hoạt','Ngữ cảnh dài và suy luận phức tạp','Đa phương thức nguyên bản và hiệu quả','Bắt đầu xây dựng','Tập trung vào điều thực sự quan trọng.','Tạo tài khoản và sử dụng các mô hình AI bạn cần chỉ trong vài phút.','Tạo tài khoản miễn phí'],
}

const keys = ['console','models','rankings','docsNav','docsAction','about','aboutUs','faq','updates','start','changeLanguage','eyebrow','headline','description','ready','availability','providers','latency','support','capabilityEyebrow','capabilityTitle','capabilityText','featureOne','featureOneText','featureTwo','featureTwoText','featureThree','featureThreeText','modelEyebrow','modelTitle','modelFast','modelReasoning','modelNative','calloutEyebrow','calloutTitle','calloutText','createAccount']
const copy = Object.fromEntries(Object.entries(translations).map(([language, values]) => [language, Object.fromEntries(keys.map((key, index) => [key, values[index]]))]))
const terminalTitles = { zhCN: 'API 请求', en: 'API Request', fr: 'Requête API', ru: 'Запрос API', ja: 'APIリクエスト', vi: 'Yêu cầu API', zhTW: 'API 請求' }
Object.entries(terminalTitles).forEach(([language, title]) => { copy[language].terminalTitle = title })
const menu = document.querySelector('.language-menu')
const trigger = document.querySelector('.language-trigger')
const dropdown = document.querySelector('.language-dropdown')
let currentLanguage = 'zhCN'

function normalizeLanguage(value) {
  if (!value) return 'en'
  const normalized = value.trim().replaceAll('_', '-').toLowerCase()
  if (['zh-tw', 'zh-hk', 'zh-mo', 'zhtw'].includes(normalized) || normalized.startsWith('zh-hant')) return 'zhTW'
  if (['zh', 'zh-cn', 'zh-hans', 'zhcn'].includes(normalized)) return 'zhCN'
  const primary = normalized.split('-')[0]
  return languages.some(([code]) => code === primary) ? primary : 'en'
}

function closeMenu() {
  dropdown.hidden = true
  trigger.setAttribute('aria-expanded', 'false')
}

function renderMenu() {
  dropdown.replaceChildren(...languages.map(([code, label]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitemradio')
    button.setAttribute('aria-checked', String(code === currentLanguage))
    const text = document.createElement('span')
    const check = document.createElement('span')
    text.textContent = label
    check.className = 'language-check'
    check.textContent = code === currentLanguage ? '✓' : ''
    button.append(text, check)
    button.addEventListener('click', () => { setLanguage(code, true); closeMenu() })
    return button
  }))
}

function setLanguage(value, persist = false) {
  currentLanguage = normalizeLanguage(value)
  const strings = copy[currentLanguage]
  document.documentElement.lang = currentLanguage === 'zhCN' ? 'zh-CN' : currentLanguage === 'zhTW' ? 'zh-TW' : currentLanguage
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = strings[node.dataset.i18n] })
  document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => node.setAttribute('aria-label', strings[node.dataset.i18nAriaLabel]))
  if (persist) localStorage.setItem('i18nextLng', currentLanguage)
  renderMenu()
}

trigger.addEventListener('click', () => {
  const open = dropdown.hidden
  dropdown.hidden = !open
  trigger.setAttribute('aria-expanded', String(open))
})
document.addEventListener('click', (event) => { if (!menu.contains(event.target)) closeMenu() })
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu() })
window.addEventListener('storage', (event) => { if (event.key === 'i18nextLng' && event.newValue) setLanguage(event.newValue) })
window.addEventListener('message', (event) => {
  if (event.data?.lang) setLanguage(event.data.lang)
  if (event.data?.themeMode) setTheme(event.data.themeMode)
})

function setTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}

document.querySelectorAll('.dots button').forEach((dot, index) => dot.addEventListener('click', () => {
  document.querySelectorAll('.model-card').forEach((card, cardIndex) => card.classList.toggle('active', cardIndex === index))
  document.querySelectorAll('.dots button').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === index))
}))
document.querySelector('.previous').addEventListener('click', () => document.querySelectorAll('.dots button')[(Array.from(document.querySelectorAll('.dots button')).findIndex((button) => button.classList.contains('active')) + 2) % 3].click())
document.querySelector('.next').addEventListener('click', () => document.querySelectorAll('.dots button')[(Array.from(document.querySelectorAll('.dots button')).findIndex((button) => button.classList.contains('active')) + 1) % 3].click())
document.getElementById('year').textContent = new Date().getFullYear()

const requested = new URLSearchParams(location.search).get('lang')
setLanguage(
  requested ||
    localStorage.getItem('i18nextLng') ||
    navigator.languages?.[0] ||
    navigator.language ||
    'en',
  Boolean(requested),
)
document.querySelectorAll('[data-documentation-link]').forEach((link) => {
  link.hidden = !documentationEnabled
})
