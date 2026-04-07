// Danh mục ICD-10 rút gọn theo Thông tư 46/2018/TT-BYT và hướng dẫn Bộ Y tế.
// Đây là tập hợp các mã chẩn đoán phổ biến nhất tại tuyến cơ sở VN.
// Full set ~14k mã sẽ được đồng bộ từ backend sau.

export type Icd10Code = {
    code: string;
    name: string;       // Tên tiếng Việt
    nameEn?: string;    // Tên gốc WHO
    chapter: string;    // Nhóm chương ICD-10
};

export const ICD10_COMMON: Icd10Code[] = [
    // Chương I: Nhiễm trùng
    { code: 'A09', name: 'Tiêu chảy nhiễm khuẩn', chapter: 'Nhiễm trùng' },
    { code: 'A90', name: 'Sốt xuất huyết Dengue', chapter: 'Nhiễm trùng' },
    { code: 'B34.9', name: 'Nhiễm virus, không đặc hiệu', chapter: 'Nhiễm trùng' },
    { code: 'U07.1', name: 'COVID-19, virus được xác định', chapter: 'Nhiễm trùng' },

    // Chương II: U
    { code: 'C34', name: 'U ác phổi, phế quản', chapter: 'U' },
    { code: 'C16', name: 'U ác dạ dày', chapter: 'U' },
    { code: 'C22', name: 'U ác gan', chapter: 'U' },
    { code: 'C50', name: 'U ác vú', chapter: 'U' },
    { code: 'D36', name: 'U lành tính, vị trí khác', chapter: 'U' },

    // Chương IV: Nội tiết - chuyển hoá
    { code: 'E10', name: 'Đái tháo đường type 1', chapter: 'Nội tiết' },
    { code: 'E11', name: 'Đái tháo đường type 2', chapter: 'Nội tiết' },
    { code: 'E14', name: 'Đái tháo đường, không đặc hiệu', chapter: 'Nội tiết' },
    { code: 'E03', name: 'Suy giáp, không đặc hiệu', chapter: 'Nội tiết' },
    { code: 'E05', name: 'Cường giáp', chapter: 'Nội tiết' },
    { code: 'E66', name: 'Béo phì', chapter: 'Nội tiết' },
    { code: 'E78', name: 'Rối loạn chuyển hoá lipoprotein', chapter: 'Nội tiết' },
    { code: 'E79', name: 'Rối loạn chuyển hoá purin (Gút)', chapter: 'Nội tiết' },

    // Chương V: Tâm thần
    { code: 'F32', name: 'Trầm cảm', chapter: 'Tâm thần' },
    { code: 'F41', name: 'Rối loạn lo âu', chapter: 'Tâm thần' },
    { code: 'F51', name: 'Rối loạn giấc ngủ không thực tổn', chapter: 'Tâm thần' },

    // Chương VI: Thần kinh
    { code: 'G43', name: 'Đau nửa đầu Migraine', chapter: 'Thần kinh' },
    { code: 'G44', name: 'Đau đầu khác', chapter: 'Thần kinh' },
    { code: 'G47', name: 'Rối loạn giấc ngủ', chapter: 'Thần kinh' },

    // Chương VII: Mắt
    { code: 'H10', name: 'Viêm kết mạc', chapter: 'Mắt' },
    { code: 'H52', name: 'Tật khúc xạ', chapter: 'Mắt' },

    // Chương VIII: Tai
    { code: 'H66', name: 'Viêm tai giữa mủ', chapter: 'Tai' },

    // Chương IX: Tuần hoàn
    { code: 'I10', name: 'Tăng huyết áp vô căn', chapter: 'Tuần hoàn' },
    { code: 'I11', name: 'Bệnh tim do tăng huyết áp', chapter: 'Tuần hoàn' },
    { code: 'I20', name: 'Đau thắt ngực', chapter: 'Tuần hoàn' },
    { code: 'I21', name: 'Nhồi máu cơ tim cấp', chapter: 'Tuần hoàn' },
    { code: 'I25', name: 'Bệnh tim thiếu máu cục bộ mạn', chapter: 'Tuần hoàn' },
    { code: 'I50', name: 'Suy tim', chapter: 'Tuần hoàn' },
    { code: 'I63', name: 'Nhồi máu não', chapter: 'Tuần hoàn' },
    { code: 'I64', name: 'Đột quỵ, không xác định xuất huyết hay nhồi máu', chapter: 'Tuần hoàn' },
    { code: 'I83', name: 'Giãn tĩnh mạch chi dưới', chapter: 'Tuần hoàn' },

    // Chương X: Hô hấp
    { code: 'J00', name: 'Viêm mũi họng cấp (cảm lạnh)', chapter: 'Hô hấp' },
    { code: 'J02', name: 'Viêm họng cấp', chapter: 'Hô hấp' },
    { code: 'J03', name: 'Viêm amidan cấp', chapter: 'Hô hấp' },
    { code: 'J06', name: 'Nhiễm khuẩn hô hấp trên cấp', chapter: 'Hô hấp' },
    { code: 'J18', name: 'Viêm phổi, tác nhân chưa xác định', chapter: 'Hô hấp' },
    { code: 'J20', name: 'Viêm phế quản cấp', chapter: 'Hô hấp' },
    { code: 'J44', name: 'COPD - Bệnh phổi tắc nghẽn mạn tính', chapter: 'Hô hấp' },
    { code: 'J45', name: 'Hen phế quản', chapter: 'Hô hấp' },

    // Chương XI: Tiêu hoá
    { code: 'K02', name: 'Sâu răng', chapter: 'Tiêu hoá' },
    { code: 'K21', name: 'Trào ngược dạ dày - thực quản', chapter: 'Tiêu hoá' },
    { code: 'K25', name: 'Loét dạ dày', chapter: 'Tiêu hoá' },
    { code: 'K29', name: 'Viêm dạ dày và tá tràng', chapter: 'Tiêu hoá' },
    { code: 'K30', name: 'Khó tiêu chức năng', chapter: 'Tiêu hoá' },
    { code: 'K52', name: 'Viêm dạ dày ruột không nhiễm khuẩn', chapter: 'Tiêu hoá' },
    { code: 'K59', name: 'Rối loạn chức năng ruột', chapter: 'Tiêu hoá' },
    { code: 'K74', name: 'Xơ gan', chapter: 'Tiêu hoá' },
    { code: 'K80', name: 'Sỏi mật', chapter: 'Tiêu hoá' },

    // Chương XII: Da
    { code: 'L20', name: 'Viêm da cơ địa', chapter: 'Da' },
    { code: 'L30', name: 'Viêm da khác', chapter: 'Da' },
    { code: 'L50', name: 'Mày đay', chapter: 'Da' },

    // Chương XIII: Cơ xương khớp
    { code: 'M10', name: 'Gút', chapter: 'Cơ xương khớp' },
    { code: 'M15', name: 'Thoái hoá đa khớp', chapter: 'Cơ xương khớp' },
    { code: 'M17', name: 'Thoái hoá khớp gối', chapter: 'Cơ xương khớp' },
    { code: 'M25', name: 'Rối loạn khớp khác', chapter: 'Cơ xương khớp' },
    { code: 'M47', name: 'Thoái hoá cột sống', chapter: 'Cơ xương khớp' },
    { code: 'M54', name: 'Đau lưng', chapter: 'Cơ xương khớp' },
    { code: 'M79', name: 'Rối loạn mô mềm khác', chapter: 'Cơ xương khớp' },

    // Chương XIV: Tiết niệu - sinh dục
    { code: 'N18', name: 'Bệnh thận mạn', chapter: 'Tiết niệu' },
    { code: 'N20', name: 'Sỏi thận và niệu quản', chapter: 'Tiết niệu' },
    { code: 'N30', name: 'Viêm bàng quang', chapter: 'Tiết niệu' },
    { code: 'N39', name: 'Nhiễm khuẩn đường tiết niệu', chapter: 'Tiết niệu' },
    { code: 'N40', name: 'Tăng sản lành tính tuyến tiền liệt', chapter: 'Tiết niệu' },

    // Chương XV: Thai sản
    { code: 'O80', name: 'Sinh thường một thai', chapter: 'Thai sản' },

    // Chương XVIII: Triệu chứng
    { code: 'R05', name: 'Ho', chapter: 'Triệu chứng' },
    { code: 'R10', name: 'Đau bụng', chapter: 'Triệu chứng' },
    { code: 'R11', name: 'Buồn nôn và nôn', chapter: 'Triệu chứng' },
    { code: 'R50', name: 'Sốt, không rõ nguyên nhân', chapter: 'Triệu chứng' },
    { code: 'R51', name: 'Đau đầu', chapter: 'Triệu chứng' },
    { code: 'R53', name: 'Mệt mỏi', chapter: 'Triệu chứng' },

    // Chương XIX: Chấn thương
    { code: 'S06', name: 'Chấn thương nội sọ', chapter: 'Chấn thương' },
    { code: 'S52', name: 'Gãy xương cẳng tay', chapter: 'Chấn thương' },
    { code: 'S72', name: 'Gãy xương đùi', chapter: 'Chấn thương' },
    { code: 'S82', name: 'Gãy xương cẳng chân', chapter: 'Chấn thương' },
    { code: 'T14', name: 'Chấn thương vị trí không xác định', chapter: 'Chấn thương' },

    // Chương XXI: Yếu tố ảnh hưởng sức khoẻ
    { code: 'Z00', name: 'Khám sức khoẻ tổng quát', chapter: 'Khám tổng quát' },
    { code: 'Z01', name: 'Khám chuyên khoa đặc biệt', chapter: 'Khám tổng quát' },
    { code: 'Z23', name: 'Cần tiêm chủng', chapter: 'Dự phòng' },
    { code: 'Z34', name: 'Theo dõi thai kỳ bình thường', chapter: 'Thai sản' },
];

/**
 * Search ICD-10 by code or name (VN diacritic-insensitive).
 */
export function searchIcd10(query: string, limit = 30): Icd10Code[] {
    const q = normalize(query);
    if (!q) return ICD10_COMMON.slice(0, limit);

    return ICD10_COMMON.filter((item) => {
        return (
            normalize(item.code).includes(q) ||
            normalize(item.name).includes(q) ||
            normalize(item.chapter).includes(q)
        );
    }).slice(0, limit);
}

function normalize(s: string): string {
    return (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .toLowerCase()
        .trim();
}
