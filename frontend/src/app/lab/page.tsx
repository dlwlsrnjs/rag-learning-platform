const LABS = [
  {
    href: "/lab/chunking",
    title: "Chunking Lab",
    desc: "같은 문서에 여러 청킹 설정을 한 번에 적용해 청크 수·길이·미리보기를 나란히 비교.",
    tag: "청킹",
  },
  {
    href: "/lab/embedding",
    title: "Embedding Lab",
    desc: "여러 임베딩 모델을 같은 질문에 돌려서 상위 청크가 얼마나 달라지는지 직접 확인.",
    tag: "임베딩",
  },
  {
    href: "/lab/preprocessing",
    title: "전처리 노하우 테스트",
    desc: "7개 시나리오로 RAG 품질을 좌우하는 전처리 전략을 퀴즈 형태로 학습.",
    tag: "전처리",
  },
  {
    href: "/lab/langgraph",
    title: "LangGraph 툴 탐색기",
    desc: "에이전트가 툴을 언제·어떻게 호출하는지, RAG과 어떻게 섞을 수 있는지 코드와 함께 탐색.",
    tag: "에이전트",
  },
];

export default function LabIndexPage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section>
        <h1 style={{ margin: 0 }}>실험실</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 760 }}>
          특정 주제를 깊이 탐색하고 싶을 때 들어오세요. 각 랩은 튜토리얼과 달리
          자유롭게 실험할 수 있는 도구 모음입니다.
        </p>
      </section>

      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
      }}>
        {LABS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="panel"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ marginBottom: 6 }}>
              <span className="badge badge-topic">{l.tag}</span>
            </div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{l.title}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{l.desc}</div>
          </a>
        ))}
      </section>
    </div>
  );
}
