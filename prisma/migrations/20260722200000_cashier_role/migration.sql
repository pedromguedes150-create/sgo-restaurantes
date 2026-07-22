-- Perfil CAIXA: login próprio, usado só na conferência de comandas por leitor
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CASHIER';
