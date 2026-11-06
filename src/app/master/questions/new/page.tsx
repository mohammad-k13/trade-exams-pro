import { QuestionEditor } from "@/components/master/question-editor";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { listTopics } from "@/server/questions";
import { requireMaster } from "@/server/session";

export const metadata = { title: t.questions.add };

export default async function NewQuestionPage() {
  const topics = await listTopics(await requireMaster());
  return (
    <>
      <PageHeader title={t.questions.add} />
      {/* eslint-disable-next-line react-hooks/purity -- server component; used only as the default date range */}
      <QuestionEditor now={Date.now()} topicSuggestions={topics.map((x) => x.name)} />
    </>
  );
}
