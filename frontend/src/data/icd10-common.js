/**
 * Common ICD-10 codes for Vietnamese EHR system.
 * Subset of most-used codes across primary care & specialist clinics.
 */
const ICD10_CODES = [
    // Bệnh nhiễm trùng
    { code: 'A09', name: 'Tiêu chảy và viêm dạ dày ruột do nhiễm trùng' },
    { code: 'A15', name: 'Lao phổi' },
    { code: 'A90', name: 'Sốt Dengue' },
    { code: 'A91', name: 'Sốt xuất huyết Dengue' },
    { code: 'B18.1', name: 'Viêm gan B mạn tính' },
    { code: 'B18.2', name: 'Viêm gan C mạn tính' },
    { code: 'B20', name: 'HIV/AIDS' },

    // Bướu tân sinh
    { code: 'C34', name: 'Ung thư phổi' },
    { code: 'C50', name: 'Ung thư vú' },
    { code: 'C61', name: 'Ung thư tuyến tiền liệt' },

    // Bệnh nội tiết, dinh dưỡng
    { code: 'E10', name: 'Đái tháo đường (ĐTĐ) tuýp 1' },
    { code: 'E11', name: 'Đái tháo đường (ĐTĐ) tuýp 2' },
    { code: 'E03', name: 'Suy giáp' },
    { code: 'E05', name: 'Cường giáp' },
    { code: 'E66', name: 'Béo phì' },
    { code: 'E78', name: 'Rối loạn chuyển hóa lipid' },

    // Rối loạn tâm thần
    { code: 'F32', name: 'Trầm cảm' },
    { code: 'F41', name: 'Rối loạn lo âu' },

    // Bệnh hệ thần kinh
    { code: 'G40', name: 'Động kinh' },
    { code: 'G43', name: 'Đau nửa đầu (Migraine)' },
    { code: 'G47.3', name: 'Ngưng thở khi ngủ' },

    // Bệnh mắt
    { code: 'H10', name: 'Viêm kết mạc' },
    { code: 'H40', name: 'Glaucoma (Tăng nhãn áp)' },

    // Bệnh tai
    { code: 'H66', name: 'Viêm tai giữa' },

    // Bệnh hệ tuần hoàn
    { code: 'I10', name: 'Tăng huyết áp nguyên phát' },
    { code: 'I11', name: 'Bệnh tim do tăng huyết áp' },
    { code: 'I20', name: 'Đau thắt ngực' },
    { code: 'I21', name: 'Nhồi máu cơ tim cấp' },
    { code: 'I25', name: 'Bệnh tim thiếu máu mạn tính' },
    { code: 'I48', name: 'Rung nhĩ' },
    { code: 'I50', name: 'Suy tim' },
    { code: 'I63', name: 'Nhồi máu não' },
    { code: 'I64', name: 'Đột quỵ' },

    // Bệnh hệ hô hấp
    { code: 'J06', name: 'Nhiễm trùng đường hô hấp trên cấp' },
    { code: 'J18', name: 'Viêm phổi' },
    { code: 'J20', name: 'Viêm phế quản cấp' },
    { code: 'J44', name: 'Bệnh phổi tắc nghẽn mạn tính (COPD)' },
    { code: 'J45', name: 'Hen phế quản' },

    // Bệnh hệ tiêu hóa
    { code: 'K21', name: 'Trào ngược dạ dày thực quản (GERD)' },
    { code: 'K25', name: 'Loét dạ dày' },
    { code: 'K29', name: 'Viêm dạ dày' },
    { code: 'K35', name: 'Viêm ruột thừa cấp' },
    { code: 'K70', name: 'Bệnh gan do rượu' },
    { code: 'K74', name: 'Xơ gan' },
    { code: 'K80', name: 'Sỏi mật' },

    // Bệnh da
    { code: 'L20', name: 'Viêm da cơ địa' },
    { code: 'L40', name: 'Vẩy nến' },

    // Bệnh cơ xương khớp
    { code: 'M06', name: 'Viêm khớp dạng thấp' },
    { code: 'M10', name: 'Gout (Bệnh gút)' },
    { code: 'M15', name: 'Thoái hóa khớp' },
    { code: 'M54', name: 'Đau lưng' },
    { code: 'M81', name: 'Loãng xương' },

    // Bệnh hệ sinh dục - tiết niệu
    { code: 'N18', name: 'Bệnh thận mạn' },
    { code: 'N20', name: 'Sỏi thận' },
    { code: 'N39.0', name: 'Nhiễm trùng đường tiết niệu (UTI)' },

    // Thai kỳ
    { code: 'O14', name: 'Tiền sản giật' },
    { code: 'O24.4', name: 'Đái tháo đường thai kỳ' },

    // Chấn thương
    { code: 'S72', name: 'Gãy xương đùi' },
    { code: 'S82', name: 'Gãy xương cẳng chân' },
    { code: 'S06', name: 'Chấn thương sọ não' },

    // Triệu chứng chung
    { code: 'R05', name: 'Ho' },
    { code: 'R10', name: 'Đau bụng' },
    { code: 'R50', name: 'Sốt' },
    { code: 'R51', name: 'Đau đầu' },
    { code: 'R73', name: 'Đường huyết tăng' },

    // Khám tổng quát
    { code: 'Z00', name: 'Khám sức khỏe tổng quát' },
    { code: 'Z01', name: 'Khám chuyên khoa' },
    { code: 'Z23', name: 'Tiêm chủng / Tiêm vắc-xin' },
    { code: 'Z96', name: 'Có thiết bị cấy ghép' },
];

export default ICD10_CODES;
