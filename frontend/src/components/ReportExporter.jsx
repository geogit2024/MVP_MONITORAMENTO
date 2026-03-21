import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { FileDown } from 'lucide-react';

const ReportExporter = ({ result, areaName }) => {
    const exportToPDF = async () => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let yPos = 20;

        // Title
        doc.setFontSize(22);
        doc.setTextColor(16, 185, 129); // Emerald-500
        doc.text('AgroSentinel IA', margin, yPos);
        
        yPos += 10;
        doc.setFontSize(14);
        doc.setTextColor(100);
        doc.text(`Laudo Técnico - ${areaName}`, margin, yPos);
        
        yPos += 5;
        doc.setDrawColor(200);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        
        yPos += 10;
        doc.setFontSize(10);
        doc.text(`Data do Processamento: ${new Date().toLocaleString()}`, margin, yPos);
        
        yPos += 10;

        // Capture charts
        const chartIds = ['ndvi-chart-v4', 'climate-chart-v4', 'anomaly-engine-v4'];
        
        for (const id of chartIds) {
            const chartElement = document.getElementById(id);
            if (chartElement) {
                try {
                    const canvas = await html2canvas(chartElement, {
                        backgroundColor: '#0f172a',
                        scale: 2
                    });
                    const imgData = canvas.toDataURL('image/png');
                    const imgWidth = pageWidth - (2 * margin);
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    
                    if (yPos + imgHeight > 280) {
                        doc.addPage();
                        yPos = 20;
                    }
                    
                    doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
                    yPos += imgHeight + 10;
                } catch (e) {
                    console.error(`Error capturing ${id}:`, e);
                }
            }
        }

        // AI Report Text
        if (result?.data?.aiReport) {
            doc.addPage();
            yPos = 20;
            doc.setFontSize(16);
            doc.setTextColor(16, 185, 129);
            doc.text('Análise da Inteligência Artificial', margin, yPos);
            
            yPos += 10;
            doc.setFontSize(10);
            doc.setTextColor(0);
            
            const splitText = doc.splitTextToSize(result.data.aiReport.replace(/### |[*]/g, ''), pageWidth - (2 * margin));
            doc.text(splitText, margin, yPos);
        }

        doc.save(`AgroSentinel_Report_${areaName.replace(/\s+/g, '_')}.pdf`);
    };

    return (
        <button 
            onClick={exportToPDF}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20"
        >
            <FileDown size={18} /> Exportar Laudo PDF (Sentinel-2)
        </button>
    );
};

export default ReportExporter;