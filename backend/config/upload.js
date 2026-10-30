/* config/upload.js */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { trechoSeguro } = require('../utils/arquivos');

const dirUploadsAtividades = path.join(__dirname, '..', 'uploads', 'atividades');
if (!fs.existsSync(dirUploadsAtividades)) {
    fs.mkdirSync(dirUploadsAtividades, { recursive: true });
}

const EXTENSOES = /^\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|csv|txt|zip|rar)$/i;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, dirUploadsAtividades);
    },
    filename: function (req, file, cb) {
        // Usuário do token (o login é livre no autocadastro: sanitizado para não
        // permitir "../" e escapar da pasta de uploads).
        const nomeUsuario = trechoSeguro((req.usuario && req.usuario.usuario) || req.body.nome_usuario_upload, 'Colaborador');

        const ext = path.extname(file.originalname).toLowerCase();
        const nomeOriginal = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);

        // Sufixo aleatório: nome do arquivo não é adivinhável.
        // Formato: NomeOriginal-Usuario-Timestamp-aleatorio.ext
        const nomeFinal = `${nomeOriginal}-${nomeUsuario}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

        cb(null, nomeFinal);
    }
});

const upload = multer({
    storage,
    // Limites por requisição (protege o disco contra envio em massa)
    limits: { fileSize: 30 * 1024 * 1024, files: 20, fields: 60, fieldSize: 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (EXTENSOES.test(path.extname(file.originalname))) {
            cb(null, true);
        } else {
            cb(Object.assign(new Error('Tipo de arquivo não permitido.'), { status: 400 }), false);
        }
    }
});

module.exports = upload;
