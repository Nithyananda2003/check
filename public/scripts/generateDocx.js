
function generateDocx(){
	const div = document.getElementById("main-document");

	const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
	"xmlns:w='urn:schemas-microsoft-com:office:word' "+
	"xmlns='http://www.w3.org/TR/REC-html40'>"+
	"<head><meta charset='utf-8'><title>Export HTML to Word Document with JavaScript</title>"+
	"<style>"+
	"@page mainBody{ margin: 0.4in 0.3in 0.4in 0.3in; mso-header-margin: 0.1in; mso-footer-margin: 0.1in; mso-paper-source: 0;}"+
	"div.main-body { page: mainBody;}"+
	"body{ font-family: sans-serif; font-size: 10px;}"+
	"table{ width: 100%;}"+
	".doc-space{ padding:5px;}"+
	".text-center{ text-align: 'center';}"+
	".doc-main-heading{ color: #ffffff; background-color: #5594b0; text-align: center; margin-top: 10px; margin-bottom: 10px;}"+
	".report-table-bg-data{ background-color: #ccdfe7 !important; text-align: center; margin-top: 10px; margin-bottom: 10px;}"+
	".report-table-bg-data-light{ background-color: #ecf9ff !important; text-align: center; margin-top: 10px; margin-bottom: 10px;}"+
	".doc-main-heading-full-left{ color: #ffffff; background-color: #5594b0; margin-top: 10px; margin-bottom: 10px;}"+
	"<style></head><body><div class='main-body'>";
	const footer = "</div></body></html>";

	const sourceHTML = header + div.innerHTML + footer;

	const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);

	const fileDownload = document.createElement("a");
	document.body.appendChild(fileDownload);
	fileDownload.href = source;
	fileDownload.download = 'document.doc';
	fileDownload.click();
	document.body.removeChild(fileDownload);
}