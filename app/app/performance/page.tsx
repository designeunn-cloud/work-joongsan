export default function PerformancePage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-10 w-full">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">성과</h1>
          <p className="text-sm text-neutral-500 mt-1">부서 × 카테고리 업무량, 체류시간, 완료율 분석 화면입니다.</p>
        </header>
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-10 text-center">
          <p className="text-sm text-neutral-500">
            성과 분석(차트, 완료율, 체류시간)은 다음 라운드에서 제공될 예정입니다.
          </p>
          <p className="text-xs text-neutral-400 mt-2">
            부서/카테고리 데이터는 이미 업무에 기록되고 있어 다음 라운드에서 바로 집계할 수 있습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
