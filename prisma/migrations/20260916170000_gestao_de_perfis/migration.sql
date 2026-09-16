-- Gestao de Perfis de acesso.
--
-- Aditivo: nenhuma tabela existente perde coluna ou dado, e `role_permissions`
-- (a configuracao dos perfis de sistema, em uso hoje) nao e tocada. A coluna
-- nova em "users" nasce nula, entao todos os usuarios seguem exatamente como
-- estao ate alguem criar um perfil e vincula-los.
--
-- `baseRole` existe porque perfil aqui e duas coisas fundidas: o conjunto de
-- TELAS (dado, em profile_permissions) e as REGRAS DE NEGOCIO (255 comparacoes
-- `role === 'X'` espalhadas no codigo). Sem declarar de quem herda a segunda, um
-- perfil novo passaria por todas elas como falso, em silencio.

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseRole" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_permissions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "profile_permissions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "profiles_name_key" ON "profiles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "profile_permissions_profileId_module_key" ON "profile_permissions"("profileId", "module");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_permissions" ADD CONSTRAINT "profile_permissions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
