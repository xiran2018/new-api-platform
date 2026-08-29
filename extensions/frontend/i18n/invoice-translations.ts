import i18n from "@/i18n/config";

const resources: Record<string, Record<string, string>> = {
  zhCN: {
    "After submitting an application, the administrator will prepare and upload the reimbursement statement.":
      "提交申请后，管理员将制作并上传报销清单。",
    "Applicant company": "申请企业",
    "Billing query failed": "账单查询失败，请稍后重试。",
    "View details": "查看详情",
    "Invoice application details": "开票申请详情",
    "Total amount": "总金额",
    "Payment provider": "支付渠道",
    User: "用户",
    "Sample instructions": "样张说明",
    "Upload image": "上传图片",
    "Align image left": "图片左对齐",
    "Align image center": "图片居中",
    "Align image right": "图片右对齐",
    "Please select an image file": "请选择图片文件。",
    "Image size cannot exceed 4 MB": "图片大小不能超过 4 MB。",
    Yuan: "元",
    Invoice: "发票",
    "Invoice management": "发票管理",
    "Invoice center": "发票中心",
    "Invoice information": "开票信息",
    "Recharge orders": "充值订单",
    "Reimbursement statements": "报销清单",
    Billing: "账单",
    "Invoice samples": "发票样张",
    "Online customer service": "在线客服",
    "Invoice title": "发票抬头",
    "Tax number": "税号",
    "Invoice type": "开票类型",
    "Recipient emails": "收票邮箱",
    "General invoice": "普通发票",
    "VAT special invoice": "增值税专用发票",
    "Submit invoice application": "提交开票申请",
    "All types": "全部类型",
    "All statuses": "全部状态",
    "Invoice status": "开票状态",
    "Application time": "申请开票时间",
    "Completion time": "完成开票时间",
    "Not requested": "未申请",
    "Reimbursement applications": "报销单申请",
    "Invoice applications": "开票申请",
    "Samples and customer service": "样张与在线客服",
    "Apply for reimbursement statement": "申请报销单",
    "My reimbursement statements": "我的报销单",
    "Statement title": "报销单名称",
    "Billing query": "账单查询",
    "Model statistics": "模型维度统计明细",
    "Date distribution": "日期分布明细",
    "Process invoice and reimbursement applications": "处理用户开票与报销申请",
    "Editable content": "可编辑内容",
    "Reimbursement instructions": "报销清单操作说明",
    "Add sample": "增加样张",
    "New sample": "新样张",
    "No invoice samples": "暂无发票样张",
    "No customer service information": "暂无客服信息",
    "View sample": "查看样张",
    "Manage invoice applications, reimbursement statements and billing records":
      "管理开票申请、报销清单与账单记录",
    "This information is used when submitting an invoice application":
      "提交开票申请时将使用这些信息",
    "Select completed, uninvoiced orders to submit one invoice application":
      "选择已完成且未开票的订单，可合并提交一张发票",
    "Preview the invoice formats maintained by administrators":
      "查看管理员维护的发票格式",
    "We are a general VAT taxpayer and support general and VAT special invoices. Electronic invoice samples are shown below.":
      "我们企业是一般纳税人，支持普通发票和增值税专用发票，以下为电子发票样张。",
    "Submit application": "提交申请",
    Instructions: "操作说明",
    "Recipient email": "收件邮箱",
    "Order number": "订单号",
    "Order status": "订单状态",
    "Recharge time": "充值时间",
    "User ID": "用户ID",
    "Tax number / Email": "税号 / 邮箱",
    Requests: "请求数",
    Tokens: "Token 数",
    Cost: "费用",
    "Start date": "开始日期",
    "End date": "结束日期",
    Query: "查询",
    pending: "待处理",
    completed: "已完成",
    processing: "处理中",
    rejected: "已驳回",
    "Search applications": "搜索申请、税号、邮箱或订单号",
    "Mark processing": "标记处理中",
    Reject: "驳回",
    Reopen: "重新打开",
    "Rejection reason": "驳回原因",
    Previous: "上一页",
    Next: "下一页",
    not_requested: "未申请",
    success: "成功",
    Replace: "替换",
    Upload: "上传",
    Download: "下载",
    "Select order": "选择订单",
    "No data": "暂无数据",
  },
  zhTW: {
    Invoice: "發票",
    "Invoice management": "發票管理",
    "Invoice center": "發票中心",
    "Invoice information": "開票資訊",
    "Recharge orders": "儲值訂單",
    "Reimbursement statements": "報銷清單",
    Billing: "帳單",
    "Invoice samples": "發票樣張",
    "Online customer service": "線上客服",
    "Invoice title": "發票抬頭",
    "Tax number": "稅號",
    "Invoice type": "開票類型",
    "Recipient emails": "收票信箱",
    "Submit invoice application": "提交開票申請",
    "All types": "全部類型",
    "All statuses": "全部狀態",
    "Invoice applications": "開票申請",
    "Reimbursement applications": "報銷單申請",
    "Billing query": "帳單查詢",
    "Model statistics": "模型維度統計明細",
    "Date distribution": "日期分佈明細",
  },
  fr: {
    Invoice: "Facture",
    "Invoice management": "Gestion des factures",
    "Invoice center": "Centre de facturation",
    "Invoice information": "Informations de facturation",
    "Recharge orders": "Commandes de recharge",
    "Reimbursement statements": "Relevés de remboursement",
    Billing: "Facturation",
    "Invoice samples": "Modèles de facture",
    "Online customer service": "Service client en ligne",
    "Invoice title": "Intitulé de facture",
    "Tax number": "Numéro fiscal",
    "Invoice type": "Type de facture",
    "Recipient emails": "E-mails destinataires",
    "Submit invoice application": "Demander une facture",
    "All types": "Tous les types",
    "All statuses": "Tous les statuts",
    "Invoice applications": "Demandes de facture",
    "Reimbursement applications": "Demandes de remboursement",
    "Billing query": "Recherche de facturation",
    "Model statistics": "Statistiques par modèle",
    "Date distribution": "Répartition par date",
  },
  ru: {
    Invoice: "Счета",
    "Invoice management": "Управление счетами",
    "Invoice center": "Центр счетов",
    "Invoice information": "Данные для счета",
    "Recharge orders": "Заказы пополнения",
    "Reimbursement statements": "Отчёты о расходах",
    Billing: "Расчёты",
    "Invoice samples": "Образцы счетов",
    "Online customer service": "Онлайн-поддержка",
    "Invoice title": "Название организации",
    "Tax number": "Налоговый номер",
    "Invoice type": "Тип счета",
    "Recipient emails": "Email получателя",
    "Submit invoice application": "Запросить счет",
    "All types": "Все типы",
    "All statuses": "Все статусы",
    "Invoice applications": "Заявки на счета",
    "Reimbursement applications": "Заявки на отчёты",
    "Billing query": "Поиск начислений",
    "Model statistics": "Статистика по моделям",
    "Date distribution": "Распределение по датам",
  },
  ja: {
    Invoice: "請求書",
    "Invoice management": "請求書管理",
    "Invoice center": "請求書センター",
    "Invoice information": "請求先情報",
    "Recharge orders": "チャージ注文",
    "Reimbursement statements": "精算書",
    Billing: "利用明細",
    "Invoice samples": "請求書サンプル",
    "Online customer service": "オンラインサポート",
    "Invoice title": "請求書宛名",
    "Tax number": "税番号",
    "Invoice type": "請求書タイプ",
    "Recipient emails": "送付先メール",
    "Submit invoice application": "請求書を申請",
    "All types": "すべてのタイプ",
    "All statuses": "すべての状態",
    "Invoice applications": "請求書申請",
    "Reimbursement applications": "精算書申請",
    "Billing query": "利用明細検索",
    "Model statistics": "モデル別統計",
    "Date distribution": "日付別統計",
  },
  vi: {
    Invoice: "Hóa đơn",
    "Invoice management": "Quản lý hóa đơn",
    "Invoice center": "Trung tâm hóa đơn",
    "Invoice information": "Thông tin xuất hóa đơn",
    "Recharge orders": "Đơn nạp tiền",
    "Reimbursement statements": "Bảng kê hoàn ứng",
    Billing: "Thanh toán",
    "Invoice samples": "Mẫu hóa đơn",
    "Online customer service": "Hỗ trợ trực tuyến",
    "Invoice title": "Tên trên hóa đơn",
    "Tax number": "Mã số thuế",
    "Invoice type": "Loại hóa đơn",
    "Recipient emails": "Email nhận hóa đơn",
    "Submit invoice application": "Gửi yêu cầu hóa đơn",
    "All types": "Tất cả loại",
    "All statuses": "Tất cả trạng thái",
    "Invoice applications": "Yêu cầu hóa đơn",
    "Reimbursement applications": "Yêu cầu bảng kê",
    "Billing query": "Tra cứu thanh toán",
    "Model statistics": "Thống kê theo mô hình",
    "Date distribution": "Phân bố theo ngày",
  },
};

const reimbursementFallbackTranslations: Record<string, string> = {
  zhTW: "提交申請後，管理員將製作並上傳報銷清單。",
  fr: "Après l’envoi de la demande, l’administrateur préparera et téléversera le relevé de remboursement.",
  ru: "После отправки заявки администратор подготовит и загрузит отчёт о расходах.",
  ja: "申請後、管理者が精算書を作成してアップロードします。",
  vi: "Sau khi gửi yêu cầu, quản trị viên sẽ chuẩn bị và tải lên bảng kê hoàn ứng.",
};

const faqManagementTranslations: Record<string, string> = {
  zhCN: "常见问答管理",
  zhTW: "常見問答管理",
  fr: "Gestion de la FAQ",
  ru: "Управление FAQ",
  ja: "よくある質問管理",
  vi: "Quản lý câu hỏi thường gặp",
};

const workflowTranslations: Record<string, Record<string, string>> = {
  zhTW: { processing: "處理中", rejected: "已駁回", "Search applications": "搜尋申請、稅號、信箱或訂單號", "Mark processing": "標記處理中", Reject: "駁回", Reopen: "重新開啟", "Rejection reason": "駁回原因", Previous: "上一頁", Next: "下一頁" },
  fr: { processing: "En traitement", rejected: "Rejetée", "Search applications": "Rechercher une demande", "Mark processing": "Marquer en traitement", Reject: "Rejeter", Reopen: "Rouvrir", "Rejection reason": "Motif du rejet", Previous: "Précédent", Next: "Suivant" },
  ru: { processing: "В обработке", rejected: "Отклонено", "Search applications": "Поиск заявок", "Mark processing": "В обработку", Reject: "Отклонить", Reopen: "Открыть снова", "Rejection reason": "Причина отклонения", Previous: "Назад", Next: "Далее" },
  ja: { processing: "処理中", rejected: "却下済み", "Search applications": "申請を検索", "Mark processing": "処理中にする", Reject: "却下", Reopen: "再開", "Rejection reason": "却下理由", Previous: "前へ", Next: "次へ" },
  vi: { processing: "Đang xử lý", rejected: "Đã từ chối", "Search applications": "Tìm kiếm yêu cầu", "Mark processing": "Đánh dấu đang xử lý", Reject: "Từ chối", Reopen: "Mở lại", "Rejection reason": "Lý do từ chối", Previous: "Trước", Next: "Tiếp" },
};

for (const [language, translations] of Object.entries(workflowTranslations)) {
  Object.assign(resources[language], translations);
}

for (const [language, translation] of Object.entries(
  faqManagementTranslations,
)) {
  resources[language]["FAQ management"] = translation;
}

const reimbursementFieldTranslations: Record<
  string,
  { company: string; yuan: string }
> = {
  zhTW: { company: "申請企業", yuan: "元" },
  fr: { company: "Entreprise demandeuse", yuan: "CNY" },
  ru: { company: "Компания-заявитель", yuan: "юань" },
  ja: { company: "申請企業", yuan: "元" },
  vi: { company: "Doanh nghiệp yêu cầu", yuan: "CNY" },
};

for (const [language, translations] of Object.entries(
  reimbursementFieldTranslations,
)) {
  resources[language]["Applicant company"] = translations.company;
  resources[language].Yuan = translations.yuan;
}

for (const [language, translation] of Object.entries(
  reimbursementFallbackTranslations,
)) {
  resources[language][
    "After submitting an application, the administrator will prepare and upload the reimbursement statement."
  ] = translation;
}

for (const [language, entries] of Object.entries(resources)) {
  i18n.addResourceBundle(language, "translation", entries, true, true);
}
