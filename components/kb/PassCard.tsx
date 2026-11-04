export interface PassData {
  holder: string;
  workspace: string;
  status: string;
  code: string;
  type: string;
}

/**
 * 会员通行证卡片 —— 视觉与交互（3D 倾斜 / 光晕 / 高光扫过）完整沿用 Aurora 原版，
 * 只把内容换成了「知识通行证」。
 */
export function PassCard({ data }: { data: PassData }) {
  return (
    <div className="ticket-wrapper">
      <div className="ticket">
        <div className="t-main">
          <div className="t-content">
            <div className="t-header">
              <div className="t-logo">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 1.8 14 9.9l8.2 2.1-8.2 2.1-2 8.1-2-8.1L1.8 12 10 9.9 12 1.8Z" />
                  <path
                    d="m19 15.8.8 2.4 2.4.8-2.4.8L19 22.2l-.8-2.4-2.4-.8 2.4-.8.8-2.4Z"
                    opacity="0.65"
                  />
                </svg>
                LOOM
              </div>
              <span className="t-type">{data.type}</span>
            </div>

            <div className="t-title">你的知识通行证</div>
            <p className="t-subtitle">开启织识个人知识库的专属钥匙。</p>

            <div className="t-details">
              <div className="t-detail-item">
                <span className="t-label">持卡人</span>
                <span className="t-value">{data.holder}</span>
              </div>
              <div className="t-detail-item">
                <span className="t-label">知识库</span>
                <span className="t-value">{data.workspace}</span>
              </div>
              <div className="t-detail-item">
                <span className="t-label">签发</span>
                <span className="t-value">今日</span>
              </div>
              <div className="t-detail-item">
                <span className="t-label">状态</span>
                <span className="t-value">{data.status}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="t-perforation">
          <div className="t-perf-line" />
        </div>

        <div className="t-stub">
          <div className="t-barcode-container">
            <div className="t-barcode" />
            <div className="t-barcode-id">{data.code}</div>
          </div>
          <div className="t-admit">
            <div className="t-admit-text">入场</div>
            <div className="t-admit-num">01</div>
          </div>
        </div>
      </div>
    </div>
  );
}
