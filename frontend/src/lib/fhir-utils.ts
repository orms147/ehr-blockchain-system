export const createFHIRBundle = (resources: any[]) => {
    return {
        resourceType: 'Bundle',
        type: 'collection',
        entry: resources.map(resource => ({
            resource: resource
        }))
    };
};

export const createFHIRCondition = (address: string, diagnosisText: string, icdCode: string = '') => {
    const condition = {
        resourceType: 'Condition',
        clinicalStatus: {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                code: 'active'
            }]
        },
        code: {
            text: diagnosisText
        },
        subject: {
            reference: `Patient/${address}`
        },
        recordedDate: new Date().toISOString()
    };

    if (icdCode) {
        // @ts-ignore
        condition.code.coding = [{
            system: 'http://hl7.org/fhir/sid/icd-10',
            code: icdCode.toUpperCase(),
            display: diagnosisText // Simplified: In real app, look up display name from code
        }];
    }

    return condition;
};

export const createFHIRDiagnosticReport = (address: string, note: string, type: string, file: File | null) => {
    const report: any = {
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: {
            text: type
        },
        subject: {
            reference: `Patient/${address}`
        },
        issued: new Date().toISOString(),
        presentedForm: []
    };

    if (file) {
        // Mocking attachment data since we can't read file content synchronously in utils
        // In real app, this would be base64 data or a URL
        report.presentedForm.push({
            contentType: file.type,
            title: file.name,
            // url: 'ipfs://...' (This would be populated after IPFS upload)
            data: 'BASE64_PLACEHOLDER'
        });
    }

    return report;
};

export const createFHIRImagingStudy = (address: string, description: string, file: File | null) => {
    // DICOM mapping wrapper
    const study: any = {
        resourceType: 'ImagingStudy',
        status: 'available',
        subject: {
            reference: `Patient/${address}`
        },
        started: new Date().toISOString(),
        description: description,
        series: []
    };

    if (file) {
        study.series.push({
            uid: `urn:oid:2.16.840.1.113883.3.1234.${Date.now()}`, // Mock OID
            modality: {
                system: 'http://dicom.nema.org/resources/ontology/DCM',
                code: 'DX',
                display: 'Digital X-Ray'
            },
            instance: [{
                uid: `urn:oid:2.16.840.1.113883.3.1234.${Date.now()}.1`,
                title: file.name
            }]
        });
    }

    return study;
};
