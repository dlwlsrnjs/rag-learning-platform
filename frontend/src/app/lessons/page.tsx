import { LESSONS } from "@/lib/lessons";

export default function LessonsIndexPage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section>
        <h1 style={{ margin: 0 }}>튜토리얼</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 760 }}>
          각 렛슨은 단계별 설명 + 인라인 실습으로 구성돼 있습니다. 강의 중에 한 단계씩
          넘기면서 개념을 설명하고, 바로 아래 위젯에서 실제 결과를 같이 확인할 수 있어요.
          모든 렛슨은 번들된 한국어 뉴스 샘플을 공유 실습 데이터로 사용합니다.
        </p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {LESSONS.map((l) => (
          <a key={l.id} href={`/lessons/${l.id}`} className="panel" style={{
            display: "block", textDecoration: "none", color: "inherit",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span className={`badge ${l.level === "beginner" ? "badge-beginner" : "badge-intermediate"}`}>
                {l.level === "beginner" ? "초급" : "중급"}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>{l.duration}</span>
              <span className="muted" style={{ fontSize: 11 }}>· {l.steps.length}단계</span>
            </div>
            <h3 style={{ margin: "0 0 8px" }}>{l.title}</h3>
            <p className="muted" style={{ margin: "0 0 10px" }}>{l.summary}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {l.topics.map((t) => (
                <span key={t} className="badge badge-topic">{t}</span>
              ))}
            </div>
          </a>
        ))}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>진행 팁 (강의용)</h3>
        <ul>
          <li>먼저 이 페이지에서 개괄을 보여 주고, 학생들이 관심 있는 렛슨을 선택하게 하세요.</li>
          <li>각 단계의 왼쪽 "설명" 박스는 판서, 오른쪽 위젯은 시연 도구로 쓰면 리듬이 좋습니다.</li>
          <li>OpenAI 키가 없어도 해시 임베딩 + stub 답변으로 흐름은 끝까지 보여집니다. 키가 있으면 실제 GPT 답변이 나옵니다.</li>
          <li>청킹 렛슨은 Chunking Lab 페이지로 이어 붙여 학생 각자가 값을 바꿔 보게 하면 좋습니다.</li>
        </ul>
      </section>
    </div>
  );
}
