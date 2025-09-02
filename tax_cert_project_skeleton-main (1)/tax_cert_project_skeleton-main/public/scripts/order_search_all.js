
class OrderSearch{
	constructor(){
		this.form = document.getElementById('orderform');

		this.year = this.form.querySelector("#year");

		this.firstname = this.form.querySelector('#firstname');
		this.lastname = this.form.querySelector('#lastname');
		this.nameSearchBtn = this.form.querySelector('#nameSearchBtn');

		this.streetNumber = this.form.querySelector("#streetnumber");
		this.streetAddress = this.form.querySelector("#streetaddress");
		this.addressSearchBtn = this.form.querySelector("#addressSearchBtn");

		this.bothBtn = this.form.querySelector("#bothBtn");

		this.tableData = document.getElementById("tabledata");
		this.loadingDiv = document.querySelector(".loading-modal");	

		this.name_search_event();
		this.address_search_event();
		this.both_search_event();
	}
	name_search_event(){
		this.nameSearchBtn.addEventListener("click", async(e) => {
			try{
				const year = this.year.value;
				const firstname = this.firstname.value;
				const lastname = this.lastname.value;

				if(firstname == "" || lastname == ""){
					alert("Please fill First name, Last name & year");
					return;
				}

				const form_data = {
					type: 'name',
					year: year,
					firstname: firstname,
					lastname: lastname
				};

				this.loading();
				const response = await fetch('/tax/AL/baldwin', {
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify(form_data)
				});
				const result = await response.json();
				console.log(result);

				const data = [];
				result.data.forEach((obj, i) => {
					if(obj.status == "fulfilled"){
						obj.value.forEach((val) => {
							data.push(val);
						})
					}
				});
				let html = "<table class='table table-border'>";
				html += "<thead><tr><th>Name</th><th>Address</th><th>Amt</th><th>Status</th><th>Year</th><th>Report</th></tr></thead><tbody>";
				data.forEach((d, i)=> {
					html += "<tr>";
					html += "<td>"+d['FullName']+"</td>";
					html += "<td>"+d['PhysAddress']+"</td>";
					html += "<td>"+d['TotalTaxDisplay']+"</td>";
					html += "<td>"+d['BalanceDueDisplay']+"</td>";
					html += "<td>"+d['tyYEAR']+"</td>";
					html += "<td><button class='btn btn-primary px-4 btn-sm rounded-0' data-pclid='"+d['ParcelInfoID']+"' data-pan='"+d['Account']+"' onClick='generatePDF(this)'>PDF</button></td>";
					html += "</tr>";
				})
				html += "</tbody></table>";
				this.tableData.innerHTML = html;

			}
			catch(error){
				this.tableData.innerHTML = "<i>Server Error, Please try again later</i>";
				console.log(error);
			}
			finally{
				this.loading_hide();
			}		

		});
	}
	address_search_event(){
		this.addressSearchBtn.addEventListener("click", async(e) => {
			try{
				const year = this.year.value;
				const streetnumber = this.streetNumber.value;
				const streetaddress = this.streetAddress.value;

				if(streetnumber == "" || streetaddress == "" ){
					alert("Please fill Street Number, Street Address & year")
					return;
				}

				const form_data = {
					type: 'address',
					year: year,
					street_number: streetnumber,
					street_address: streetaddress
				};

				this.loading();
				const response = await fetch('/tax/al/baldwin', {
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify(form_data)
				});
				const result = await response.json();
				console.log(result);

				const data = [];
				result.data.forEach((obj, i) => {
					if(obj.status == "fulfilled"){
						obj.value.forEach((val) => {
							data.push(val);
						})
					}
				});
				let html = "<table class='table table-border'>";
				html += "<thead><tr><th>Name</th><th>Address</th><th>Amt</th><th>Status</th><th>Year</th><th>Report</th></tr></thead><tbody>";
				data.forEach((d, i)=> {
					html += "<tr>";
					html += "<td>"+d['FullName']+"</td>";
					html += "<td>"+d['PhysAddress']+"</td>";
					html += "<td>"+d['TotalTaxDisplay']+"</td>";
					html += "<td>"+d['BalanceDueDisplay']+"</td>";
					html += "<td>"+d['tyYEAR']+"</td>";
					html += "<td><button class='btn btn-primary px-4 btn-sm rounded-0' data-pclid='"+d['ParcelInfoID']+"' data-pan='"+d['Account']+"' onClick='generatePDF(this)'>PDF</button></td>";
					html += "</tr>";
				})
				html += "</tbody></table>";
				this.tableData.innerHTML = html;

			}
			catch(error){
				this.tableData.innerHTML = "<i>Server Error, Please try again later</i>";
				console.log(error);
			}
			finally{
				this.loading_hide();
			}
		});
	}
	both_search_event(){
		this.bothBtn.addEventListener("click", async(e) => {
			try{
				const year = this.year.value;
				const firstname = this.firstname.value;
				const lastname = this.lastname.value;
				const streetnumber = this.streetNumber.value;
				const streetaddress = this.streetAddress.value;

				if(firstname == "" || lastname == ""){
					alert("Please fill all the fields");
					return;
				}

				const form_data = {
					type: 'both',
					year: year,
					firstname: firstname,
					lastname: lastname,
					street_number: streetnumber,
					street_address: streetaddress
				};

				this.loading();
				const response = await fetch('/tax/al/baldwin', {
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify(form_data)
				});
				const result = await response.json();
				console.log(result);

				const data = [];
				result.data.forEach((obj, i) => {
					if(obj.status == "fulfilled"){
						obj.value.forEach((val) => {
							data.push(val);
						})
					}
				});
				let html = "<table class='table table-border'>";
				html += "<thead><tr><th>Name</th><th>Address</th><th>Amt</th><th>Status</th><th>Year</th><th>Report</th></tr></thead><tbody>";
				data.forEach((d, i)=> {
					html += "<tr>";
					html += "<td>"+d['FullName']+"</td>";
					html += "<td>"+d['PhysAddress']+"</td>";
					html += "<td>"+d['TotalTaxDisplay']+"</td>";
					html += "<td>"+d['BalanceDueDisplay']+"</td>";
					html += "<td>"+d['tyYEAR']+"</td>";
					html += "<td><button class='btn btn-primary px-4 btn-sm rounded-0' data-pclid='"+d['ParcelInfoID']+"' data-pan='"+d['Account']+"' onClick='generatePDF(this)'>PDF</button></td>";
					html += "</tr>";
				})
				html += "</tbody></table>";
				this.tableData.innerHTML = html;

				// NEW CODE
				// const arr1 = (result.data[0]['status'] == '"fulfilled"') ? [...result.data[0]['value']] : [];
				// const arr2 = (result.data[1]['status'] == '"fulfilled"') ? [...result.data[1]['value']] : []; 
				// console.log(arr1, arr2);
				// const common = arr1.concat(arr2);
				// console.log(common);

			}
			catch(error){
				this.tableData.innerHTML = "<i>Server Error, Please try again later</i>";
				console.log(error);
			}
			finally{
				this.loading_hide();
			}
		});
	}
	loading(){
		this.loadingDiv.classList.remove('loading-modal-hide');
	}
	loading_hide(){
		this.loadingDiv.classList.add('loading-modal-hide');
	}
}

new OrderSearch();