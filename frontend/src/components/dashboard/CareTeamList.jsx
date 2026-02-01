"use client";

import React, { useState, useEffect } from 'react';
import {
    Users, Shield, CheckCircle, Clock,
    UserCircle, Stethoscope, Building2, ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { keyShareService } from '@/services';
import { toast } from '@/components/ui/use-toast';
import { useWeb3Auth } from '@web3auth/modal/react';

// Contract Config (for role checking)
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS;
import { ACCESS_CONTROL_ABI } from '@/config/contractABI';

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const CareTeamList = ({ cidHash }) => {
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const { provider } = useWeb3Auth();

    useEffect(() => {
        if (cidHash) fetchTeam();
    }, [cidHash]);

    const fetchTeam = async () => {
        try {
            setLoading(true);
            const data = await keyShareService.getRecordRecipients(cidHash);

            // Enrich with roles (Doctor/Org check)
            const enriched = await Promise.all(data.map(async (member) => {
                try {
                    const status = await publicClient.readContract({
                        address: ACCESS_CONTROL_ADDRESS,
                        abi: ACCESS_CONTROL_ABI,
                        functionName: 'getUserStatus',
                        args: [member.walletAddress]
                    });

                    let role = 'Người xem';
                    if (status[4]) role = 'Tổ chức (Verified)';
                    else if (status[3]) role = 'Tổ chức';
                    else if (status[2]) role = 'Bác sĩ (Verified)';
                    else if (status[1]) role = 'Bác sĩ';

                    return { ...member, roleLabel: role };
                } catch (e) {
                    return { ...member, roleLabel: 'Thành viên' };
                }
            }));

            setTeam(enriched);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="text-sm text-slate-500">Đang tải danh sách nhóm...</div>;
    if (team.length === 0) return null;

    return (
        <Card className="mt-4 border-blue-100 bg-blue-50/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-800">
                    <Users className="w-4 h-4" />
                    Care Graph (Ai đang xem hồ sơ này?)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {team.map((member, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                            <div className="flex items-center gap-3">
                                {member.roleLabel.includes('Bác sĩ') ?
                                    <Stethoscope className="w-8 h-8 p-1.5 bg-blue-100 text-blue-600 rounded-full" /> :
                                    member.roleLabel.includes('Tổ chức') ?
                                        <Building2 className="w-8 h-8 p-1.5 bg-purple-100 text-purple-600 rounded-full" /> :
                                        <UserCircle className="w-8 h-8 p-1.5 bg-slate-100 text-slate-500 rounded-full" />
                                }
                                <div>
                                    <p className="text-sm font-medium text-slate-900">
                                        {member.walletAddress.slice(0, 6)}...{member.walletAddress.slice(-4)}
                                    </p>
                                    <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-normal bg-slate-50">
                                        {member.roleLabel}
                                    </Badge>
                                </div>
                            </div>

                            {/* Visual Indicator of "Implicit Trust" */}
                            <div className="text-right">
                                <span className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                                    <CheckCircle className="w-3 h-3 text-green-500" />
                                    Đang truy cập
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default CareTeamList;
