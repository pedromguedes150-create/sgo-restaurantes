-- Central de Currículos (v1.212.0) — só ADITIVA: tabelas novas e uma coluna com padrão.
CREATE TYPE "ResumeStatus" AS ENUM ('RECEBIDO', 'EM_ANALISE', 'PRIMEIRA_ETAPA', 'ENTREVISTA_AGENDADA', 'AVALIACAO_FINAL', 'APROVADO', 'REPROVADO', 'BANCO_DE_TALENTOS', 'DESISTENCIA', 'CONTRATADO');
CREATE TYPE "ResumeEventKind" AS ENUM ('ENCAMINHADO', 'SITUACAO', 'LEITURA_RH');

ALTER TABLE "api_clients" ADD COLUMN "canReadResumes" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "resume_job_titles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resume_job_titles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "resume_job_titles_name_key" ON "resume_job_titles"("name");

CREATE TABLE "candidate_resumes" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "jobTitleId" TEXT,
    "jobTitleName" TEXT NOT NULL,
    "attachmentPath" TEXT NOT NULL,
    "attachmentMime" TEXT NOT NULL,
    "note" TEXT,
    "status" "ResumeStatus" NOT NULL DEFAULT 'RECEBIDO',
    "statusNote" TEXT,
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interviewAt" TIMESTAMP(3),
    "rhCandidateId" TEXT,
    "rhReadAt" TIMESTAMP(3),
    "rhSyncedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "candidate_resumes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "candidate_resumes_unitId_createdAt_idx" ON "candidate_resumes"("unitId", "createdAt");
CREATE INDEX "candidate_resumes_status_idx" ON "candidate_resumes"("status");
CREATE INDEX "candidate_resumes_rhCandidateId_idx" ON "candidate_resumes"("rhCandidateId");

CREATE TABLE "candidate_resume_events" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "kind" "ResumeEventKind" NOT NULL,
    "fromStatus" "ResumeStatus",
    "toStatus" "ResumeStatus",
    "note" TEXT,
    "origem" TEXT NOT NULL,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_resume_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "candidate_resume_events_resumeId_createdAt_idx" ON "candidate_resume_events"("resumeId", "createdAt");

ALTER TABLE "candidate_resumes" ADD CONSTRAINT "candidate_resumes_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_resumes" ADD CONSTRAINT "candidate_resumes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "candidate_resume_events" ADD CONSTRAINT "candidate_resume_events_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "candidate_resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
